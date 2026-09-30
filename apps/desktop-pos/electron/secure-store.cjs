const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')

// Renderer supplies a storage key, never a filesystem path. Credentials only
// reach disk through the operating system's protected credential encryption.
function createSecureStore(directory, encryption) {
  let pending = Promise.resolve()
  const serial = (operation) => {
    const result = pending.then(operation)
    pending = result.catch(() => {})
    return result
  }
  const fileFor = (key) => {
    if (typeof key !== 'string' || !/^sb-[a-z0-9-]+$/i.test(key) || key.length > 200)
      throw new Error('Invalid credential key')
    return path.join(directory, crypto.createHash('sha256').update(key).digest('hex') + '.bin')
  }
  const requireEncryption = () => {
    if (!encryption.isEncryptionAvailable() || encryption.getSelectedStorageBackend?.() === 'basic_text')
      throw new Error('Secure credential storage is unavailable. Unlock your operating system account and try again.')
  }
  return {
    get: (key) => serial(async () => {
      const file = fileFor(key)
      requireEncryption()
      try { return encryption.decryptString(await fs.readFile(file)) }
      catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Saved sign-in could not be unlocked. Sign in again.') }
    }),
    set: (key, value) => serial(async () => {
      const file = fileFor(key)
      requireEncryption()
      if (typeof value !== 'string' || Buffer.byteLength(value) > 128 * 1024) throw new Error('Invalid credential value')
      await fs.mkdir(directory, { recursive: true, mode: 0o700 })
      const temporary = file + '.tmp'
      await fs.writeFile(temporary, encryption.encryptString(value), { mode: 0o600, flush: true })
      await fs.rename(temporary, file)
    }),
    remove: (key) => serial(async () => {
      const file = fileFor(key)
      await fs.rm(file, { force: true })
      await fs.rm(file + '.tmp', { force: true })
    }),
  }
}
module.exports = { createSecureStore }
