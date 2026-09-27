import 'server-only'

/** Where uploaded images live. The bunny client arrives with the upload module (stage 5). */
export interface MediaStorage {
  delete(path: string): Promise<void>
}

/** Until a client exists nothing can be deleted; every queued path is retried later. */
export const unavailableStorage: MediaStorage = {
  async delete() {
    throw new Error('media storage is not configured')
  },
}
