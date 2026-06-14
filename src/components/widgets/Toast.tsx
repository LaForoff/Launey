import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import './Toast.css'

export interface ToastMessage {
  id: number
  type: 'success' | 'warning' | 'error'
  text: string
}

interface ToastProps {
  message: ToastMessage | null
}

export function Toast({ message }: ToastProps) {
  if (!message) {
    return null
  }

  if (typeof document === 'undefined') {
    return null
  }

  const toastRoot = document.getElementById('modal-root') ?? document.body

  return createPortal(
    <motion.div
      className={
        message.type === 'error'
          ? 'toast toast-error'
          : message.type === 'warning'
            ? 'toast toast-warning'
            : 'toast'
      }
      initial={{ opacity: 0, x: '-50%', y: 8 }}
      animate={{ opacity: 1, x: '-50%', y: 0 }}
      exit={{ opacity: 0, x: '-50%', y: 8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {message.text}
    </motion.div>
    ,
    toastRoot,
  )
}
