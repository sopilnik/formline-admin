export const ADMIN_URL = 'postgres://postgres:postgres@127.0.0.1:55432/postgres'
export const TEST_DB = 'formline_test'
export const MIGRATOR_URL = `postgres://postgres:postgres@127.0.0.1:55432/${TEST_DB}`
export const APP_PASSWORD = 'app-local-password'
export const APP_POOLED_URL = `postgres://app:${APP_PASSWORD}@127.0.0.1:56432/${TEST_DB}`
export const APP_DIRECT_URL = `postgres://app:${APP_PASSWORD}@127.0.0.1:55432/${TEST_DB}`
