import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-2xl' }) {
  if (!open) return null
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className={`w-full ${maxWidth} card-glass rounded-3xl overflow-hidden border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.5)]`}>
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/5">
            <DialogTitle className="text-sm font-black text-white uppercase tracking-widest">{title}</DialogTitle>
            <button onClick={onClose} className="p-2 rounded-xl bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/10 transition-colors">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="px-6 py-6 fade-in">{children}</div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
