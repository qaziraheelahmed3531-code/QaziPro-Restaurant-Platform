// Unit regression against the actual TSX/helper; this is not a browser visual test.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url),ts=require('typescript')
const vertical=[],horizontal=[],history=[],observers=[]
const states=[];let cursor=0,effects=[]
const rail={clientWidth:390,querySelector:()=>({offsetLeft:600,clientWidth:100}),scrollTo:options=>horizontal.push(options)}
const header={getBoundingClientRect:()=>({height:80})},cards={}
const target={id:'burgers',offsetHeight:500,classList:{contains:name=>name==='category-menu-section'},getBoundingClientRect:()=>({top:1000})}
const compact={classList:{contains:()=>true},getBoundingClientRect:()=>({height:52})}
const document={querySelector:selector=>selector==='.site-header'?header:selector==='.category-tile-rail'?cards:selector==='.sticky-category-nav'?compact:null,getElementById:id=>id==='burgers'?target:id==='deals'?{...target,id}:null}
const window={scrollY:500,innerHeight:844,location:{href:'http://localhost:3000/'},scrollTo:options=>vertical.push(options),history:{replaceState:(...args)=>history.push(args)}}
const react={useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>states[i]=value]},useRef:()=>({current:rail}),useEffect:fn=>effects.push(fn),useCallback:fn=>fn}
const jsx=(type,props)=>({type,props})
const load=(path,extra={})=>{
 const exports={}
 const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(code,{exports,URL,Map,document,window,IntersectionObserver:class{constructor(callback,options){this.callback=callback;this.options=options;observers.push(this)}observe(){}disconnect(){}},ResizeObserver:class{observe(){}disconnect(){}},require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='next/navigation'?{}:name.includes('use-hydration-safe-reduced-motion')?{useHydrationSafeReducedMotion:()=>false}:extra[name]??(()=>{throw Error(`Unexpected import ${name}`)})()})
 return exports
}
const helper=load('../lib/navigation/home-sections.ts')
const {StickyCategoryNav}=load('../components/home/sticky-category-nav.tsx',{'@/lib/navigation/home-sections':helper})
const render=()=>{cursor=0;effects=[];return StickyCategoryNav({sections:[{id:'deals',title:'Deals'},{id:'burgers',title:'Burgers'}]})}
let tree=render();effects.forEach(fn=>fn())
assert.equal(tree.props['aria-hidden'],true)
const cardObserver=observers[0],sectionObserver=observers[1]
cardObserver.callback([{isIntersecting:false,boundingClientRect:{bottom:1400}}])
assert.equal(states[0],false,'Original cards below viewport must not activate the bar')
cardObserver.callback([{isIntersecting:true,boundingClientRect:{bottom:400}}])
assert.equal(states[0],false)
cardObserver.callback([{isIntersecting:false,boundingClientRect:{bottom:70}}])
assert.equal(states[0],true,'Bar appears only after cards pass above the header')
sectionObserver.callback([{isIntersecting:true,target,boundingClientRect:{top:150}}])
assert.equal(states[1],'burgers')
assert.equal(vertical.length,0,'Observers never scroll the document')
tree=render();effects[1]()
assert.equal(horizontal.length,1)
assert.equal(vertical.length,0,'Active-tab centering is horizontal only')
assert.equal(horizontal[0].left,455)
tree.props.children.props.children[1].props.onClick()
assert.equal(vertical.length,1,'One click performs exactly one vertical scroll')
assert.equal(vertical[0].top,1356,'Menu target clears header and compact nav')
assert.equal(history.length,1);assert.equal(history[0][2],'/#burgers')
cardObserver.callback([{isIntersecting:true,boundingClientRect:{bottom:400}}])
assert.equal(states[0],false,'Returning to original cards hides compact nav')
assert.equal(helper.scrollToHomeSection('missing'),false)
assert.equal(vertical.length,1,'Missing sections do not navigate')
console.log('PASS: original-card visibility, observer-only active state, horizontal-only centering, one-click/one-scroll, header offsets and return-up hiding (unit mocks; not browser QA)')
