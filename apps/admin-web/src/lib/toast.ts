import { toast } from 'react-toastify'
import { ApiError } from './api'

/** Every mutation's onError follows the same shape -- surface the API's message, or a caller-provided fallback for anything else (network errors, etc). */
export function notifyError(err: unknown, fallback: string) {
  toast.error(err instanceof ApiError ? err.message : fallback)
}

export function notifySuccess(message: string) {
  toast.success(message)
}
