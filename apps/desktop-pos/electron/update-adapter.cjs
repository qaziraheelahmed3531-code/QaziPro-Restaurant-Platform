// The real driver is electron-updater (NSIS). This controller never charges,
// installs on quit, or restarts a counter automatically.
function createUpdateAdapter({driver,configured,now=Date.now}) {
 let state={status:configured?'IDLE':'NOT_CONFIGURED',message:configured?'Check for a signed update.':'Signed update feed is not configured.'};
 let safety={safe:false,at:0},busy=false;
 if(driver){
  driver.autoDownload=false;driver.autoInstallOnAppQuit=false;driver.allowDowngrade=false;driver.disableWebInstaller=true;
  driver.on('update-available',info=>{state={status:'AVAILABLE',version:String(info.version),message:'A signed update is available.'}});
  driver.on('update-not-available',()=>{state={status:'CURRENT',message:'This installation is up to date.'}});
  driver.on('update-downloaded',info=>{state={status:'READY',version:String(info.version),message:'Verified update ready. Finish and sync work before restarting.'}});
  driver.on('error',()=>{state={status:'FAILED',message:'Update could not be verified or downloaded. The current app and saved sales are unchanged.'}});
 }
 return {
  status:()=>({...state}),
  setSafety:value=>{safety={safe:value===true,at:now()}},
  async run(action){
   if(!configured||!driver)return {...state};
   if(busy)return {status:'BUSY',message:'An update operation is already running.'};
   if(!['check','download','install'].includes(action))throw Error('Invalid update operation');
   if(action==='install'){
    if(state.status!=='READY')return {status:'BLOCKED',message:'Download and verify an update first.'};
    if(!safety.safe||now()-safety.at>5000)return {status:'BLOCKED',message:'Finish the cart/payment and sync all saved sales before restarting.'};
    // Latch before invoking the native driver: a second IPC request must not
    // launch another installer while Electron is still shutting down.
    busy=true;state={status:'INSTALLING',message:'Restarting to install the verified update.'};
    try{driver.quitAndInstall(false,true);}
    catch{busy=false;state={status:'FAILED',message:'The update could not start. Saved sales are unchanged. Check for updates again.'};}
    return {...state};
   }
   if(action==='download'&&state.status!=='AVAILABLE')return {status:'BLOCKED',message:'Check for an available update first.'};
   busy=true;state={...state,status:action==='check'?'CHECKING':'DOWNLOADING',message:action==='check'?'Checking for updates…':'Downloading and verifying update…'};
   try{if(action==='check')await driver.checkForUpdates();else await driver.downloadUpdate();}
   catch{state={status:'FAILED',message:'Update could not be verified or downloaded. Saved sales are unchanged.'};}
   finally{busy=false;}
   return {...state};
  }
 };
}
module.exports={createUpdateAdapter};
