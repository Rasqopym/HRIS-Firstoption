import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { TaxBand } from '../../types'

export default function TaxBands() {
  const [bands, setBands] = useState<TaxBand[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchTaxBands = async () => {
      try {
        const { data, error } = await supabase
          .from('tax_bands')
          .select('id, band_order, lower_bound, upper_bound, rate')
          .order('band_order', { ascending: true })

        if (error) throw error

        const mappedBands: TaxBand[] = data?.map(band => ({
          id: band.id,
          label: `Band ${band.band_order}`,
          from: band.lower_bound,
          to: band.upper_bound,
          rate: Math.round(band.rate * 100), // Convert decimal to percentage
        })) ?? []

        setBands(mappedBands)
      } catch (err) {
        console.error('Error fetching tax bands:', err)
        setError('Failed to load tax bands')
      } finally {
        setLoading(false)
      }
    }

    fetchTaxBands()
  }, [])

  const updateBand = (id: string, patch: Partial<TaxBand>) => {
    setBands(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
  }

  const renumberBandOrder = async () => {
    // Update band_order in database for all bands
    const updates = bands.map((band, index) =>
      supabase
        .from('tax_bands')
        .update({ band_order: index + 1 })
        .eq('id', band.id)
    )

    const results = await Promise.all(updates)
    const firstError = results.find(r => r.error)
    if (firstError) {
      console.error('Error renumbering bands:', firstError.error)
      throw firstError.error
    }

    // Update local labels
    setBands(prev => prev.map((b, i) => ({ ...b, label: `Band ${i + 1}` })))
  }

  const addBand = async () => {
    const newBandOrder = bands.length + 1
    const lowerBound = bands.length === 0 ? 0 : bands[bands.length - 1].from + 1000000
    setError('')
    setSaving(true)

    try {
      const { data, error } = await supabase
        .from('tax_bands')
        .insert({
          band_order: newBandOrder,
          lower_bound: lowerBound,
          upper_bound: null,
          rate: 0.24, // 24% as decimal
        })
        .select()
        .single()

      if (error) throw error
      if (!data) throw new Error('Failed to create tax band')

      const newBand: TaxBand = {
        id: data.id,
        label: `Band ${newBandOrder}`,
        from: data.lower_bound,
        to: data.upper_bound,
        rate: Math.round(data.rate * 100),
      }

      setBands(prev => [...prev, newBand])
      setEditingId(newBand.id)

      // Renumber all bands to ensure consistency
      await renumberBandOrder()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to add tax band'
      setError(errorMsg)
      console.error('Error adding tax band:', err)
    } finally {
      setSaving(false)
    }
  }

  const removeBand = async (id: string) => {
    if (bands.length <= 1) return

    const bandToRemove = bands.find(b => b.id === id)
    if (!bandToRemove) return

    // Prevent deleting the first/lowest band
    if (bands[0].id === id) {
      setError('Cannot delete the first tax band')
      return
    }

    setError('')
    setSaving(true)

    try {
      const { error } = await supabase
        .from('tax_bands')
        .delete()
        .eq('id', id)

      if (error) throw error

      setBands(prev => prev.filter(b => b.id !== id))

      // Renumber all bands to ensure consistency
      await renumberBandOrder()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete tax band'
      setError(errorMsg)
      console.error('Error deleting tax band:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    setError('')
    setSaving(true)
    setSaved(false)

    try {
      const updates = bands.map(band =>
        supabase
          .from('tax_bands')
          .update({
            lower_bound: band.from,
            upper_bound: band.to,
            rate: band.rate / 100, // Convert percentage back to decimal
          })
          .eq('id', band.id)
      )

      const results = await Promise.all(updates)
      const firstError = results.find(r => r.error)
      if (firstError) throw firstError.error

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save tax bands'
      setError(errorMsg)
      console.error('Error saving tax bands:', err)
    } finally {
      setSaving(false)
    }
  }

  const fmt = (n: number) => `₦${n.toLocaleString()}`

  if (loading) {
    return (
      <div className="p-6 anim-fade-up">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 anim-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-semibold text-slate-800 text-xl">PAYE Tax Bands Configuration</h2>
          <p className="text-sm text-slate-500">Configurable tax brackets — update when legislation changes. Bands are applied progressively to each staff member's annual taxable income.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={addBand} 
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Band
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${saved ? 'bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {saving ? 'Saving...' : saved ? <span className="flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>Saved</span> : 'Save Bands'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="max-w-3xl">
        {/* Visual rate chart */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-5">
          <h3 className="font-display font-semibold text-slate-700 text-sm mb-4">Rate Visualisation</h3>
          <div className="space-y-2">
            {bands.map(b => (
              <div key={b.id} className="flex items-center gap-3">
                <div className="w-44 text-xs text-slate-500 text-right">
                  {fmt(b.from)}{b.to ? ` – ${fmt(b.to)}` : '+'}
                </div>
                <div className="flex-1 bg-slate-100 rounded-full h-5 relative overflow-hidden">
                  <div
                    className="h-5 rounded-full transition-all"
                    style={{ width: `${Math.max(b.rate, 1)}%`, background: b.rate === 0 ? '#e2e8f0' : `hsl(${220 - b.rate * 6}, 80%, ${60 - b.rate}%)` }}
                  />
                </div>
                <div className="w-10 text-xs font-mono-data font-semibold text-slate-700">{b.rate}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* Editable table */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <h3 className="font-display font-semibold text-slate-700 text-sm">Tax Band Table</h3>
            <span className="text-xs text-slate-400">Applied annually to taxable income (progressive)</span>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-50">
              <tr>
                {['Band', 'Annual Income From (₦)', 'Annual Income To (₦)', 'Tax Rate (%)', ''].map(h => (
                  <th key={h} className="py-3 px-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {bands.map((b, idx) => (
                <tr key={b.id} className="table-row-hover">
                  <td className="py-3 px-4">
                    <input
                      value={b.label}
                      disabled
                      className="w-20 text-sm border border-slate-200 rounded px-2 py-1 bg-slate-50 text-slate-500 cursor-not-allowed"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 text-xs">₦</span>
                      <input
                        type="number" value={b.from}
                        onChange={e => updateBand(b.id, { from: Number(e.target.value) })}
                        className="w-32 text-sm border border-slate-200 rounded px-2 py-1 font-mono-data focus:outline-none focus:border-blue-400"
                      />
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {b.to !== null ? (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400 text-xs">₦</span>
                        <input
                          type="number" value={b.to}
                          onChange={e => updateBand(b.id, { to: Number(e.target.value) })}
                          className="w-32 text-sm border border-slate-200 rounded px-2 py-1 font-mono-data focus:outline-none focus:border-blue-400"
                        />
                      </div>
                    ) : (
                      <span className="text-slate-400 text-sm italic">No upper limit</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min={0} max={100} value={b.rate}
                        onChange={e => updateBand(b.id, { rate: Number(e.target.value) })}
                        className="w-20 text-sm border border-slate-200 rounded px-2 py-1 font-mono-data focus:outline-none focus:border-blue-400"
                      />
                      <span className="text-slate-400 text-xs">%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => removeBand(b.id)}
                      disabled={idx === 0 || saving}
                      className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-100">
          <div className="flex items-start gap-2">
            <svg className="text-amber-500 flex-none mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p className="text-xs text-amber-700 leading-relaxed">
              <strong>Important:</strong> These bands apply to annual taxable income. The payroll engine divides each staff member's annual taxable income across these bands progressively to calculate their monthly PAYE. Update bands whenever the Finance Act changes. Changes take effect from the next payroll run.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
