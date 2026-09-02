// Rate limiting client-side para tentativas de login (defesa em profundidade,
// complementar ao bloqueio "auth/too-many-requests" já aplicado pelo Firebase).
const STORAGE_KEY = 'login_rate_limit_v1'
const MAX_ATTEMPTS = 5
// tempos de bloqueio progressivos: 30s, 1min, 2min, 5min, 10min
const LOCKOUT_STEPS_MS = [30_000, 60_000, 120_000, 300_000, 600_000]

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase()
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // localStorage indisponível (ex.: modo privado) - segue sem persistir
  }
}

export function getLoginLockState(email) {
  const store = readStore()
  const entry = store[normalizeEmail(email)]
  if (!entry) return { locked: false, remainingMs: 0, attempts: 0 }
  const remainingMs = entry.lockUntil ? entry.lockUntil - Date.now() : 0
  if (remainingMs > 0) {
    return { locked: true, remainingMs, attempts: entry.attempts || 0 }
  }
  return { locked: false, remainingMs: 0, attempts: entry.attempts || 0 }
}

export function registerFailedLogin(email) {
  const key = normalizeEmail(email)
  const store = readStore()
  const entry = store[key] || { attempts: 0, lockCount: 0 }
  entry.attempts += 1

  let remainingMs = 0
  if (entry.attempts >= MAX_ATTEMPTS) {
    const stepIndex = Math.min(entry.lockCount, LOCKOUT_STEPS_MS.length - 1)
    const duration = LOCKOUT_STEPS_MS[stepIndex]
    entry.lockUntil = Date.now() + duration
    entry.lockCount += 1
    entry.attempts = 0
    remainingMs = duration
  }

  store[key] = entry
  writeStore(store)
  return { locked: remainingMs > 0, remainingMs, attempts: entry.attempts }
}

export function resetLoginAttempts(email) {
  const key = normalizeEmail(email)
  const store = readStore()
  if (store[key]) {
    delete store[key]
    writeStore(store)
  }
}

export function getMaxAttempts() {
  return MAX_ATTEMPTS
}

export function formatRemainingTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) {
    return `${minutes}min ${seconds.toString().padStart(2, '0')}s`
  }
  return `${seconds}s`
}
