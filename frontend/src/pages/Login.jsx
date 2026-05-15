import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Layers, Eye, EyeOff, LogIn } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState(false)
  const { setUser } = useAuth()
  const navigate = useNavigate()

  async function submit(e) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const user = await api.post('/auth/login', form)
      setUser(user)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Invalid credentials')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="relative w-full max-w-sm"
      >
        <div className="card p-8 shadow-2xl shadow-black/50">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mb-4 shadow-lg shadow-brand-500/25">
              <Layers size={22} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-zinc-100">IT Management System</h1>
            <p className="text-sm text-zinc-500 mt-1">Bykea IT — Sign in to continue</p>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </motion.div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Username</label>
              <input
                type="text" autoComplete="username" autoFocus required
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                className="input-base" placeholder="admin"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'} autoComplete="current-password" required
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className="input-base pr-10" placeholder="••••••••"
                />
                <button type="button" onClick={() => setShow(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="btn-primary w-full justify-center py-2.5 mt-2 text-sm">
              {loading
                ? <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </span>
                : <span className="flex items-center gap-2"><LogIn size={15} /> Sign In</span>
              }
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] text-zinc-600">
            Bykea IT Asset Management System
          </p>
        </div>
      </motion.div>
    </div>
  )
}
