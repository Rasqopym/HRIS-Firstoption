import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import { toPng } from 'html-to-image'

type Orientation = 'landscape' | 'portrait'
type CardSide = 'front' | 'back'
type ViewMode = 'single' | 'bulk'

interface StaffMember {
  id: string
  full_name: string
  job_title: string
  department_name: string
  photo_url: string
  staff_code: string
  id_verification_code: string
  id_card_issued_at: string | null
  id_card_expires_at: string | null
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ')
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getInitialsColor(name: string): string {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function PhotoPlaceholder({ name, size }: { name: string; size: number }) {
  const initials = getInitials(name)
  const bgColor = getInitialsColor(name)
  return (
    <div
      className="flex items-center justify-center font-display font-bold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: bgColor,
        fontSize: size * 0.4
      }}
    >
      {initials}
    </div>
  )
}

interface CompanySettings {
  name: string
  email: string
  address: string
  phone: string
  website: string
  rc_number: string
  logo_url: string | null
  primary_color?: string
  accent_color?: string
}

function IDCardLandscape({ s, side, companySettings }: { s: StaffMember; side: CardSide; companySettings: CompanySettings | null }) {
  const firstName = s.full_name.split(' ').slice(0, -1).join(' ') || s.full_name
  const lastName = s.full_name.split(' ').slice(-1)[0] || ''
  const verificationUrl = `${window.location.origin}/verify/${s.id_verification_code}`
  const primaryColor = companySettings?.primary_color || '#1e3a5f'
  const accentColor = companySettings?.accent_color || '#2563eb'

  // Default expiry to 2 years from today if null
  const expiryDate = s.id_card_expires_at || new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString()
  const expiryFormatted = new Date(expiryDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()

  if (side === 'back') {
    return (
      <div style={{
        width: '507px',
        height: '320px',
        borderRadius: '16px',
        overflow: 'hidden',
        background: 'white',
        boxSizing: 'border-box',
        position: 'relative',
        display: 'flex'
      }}>
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #000 2px, #000 3px)',
          backgroundSize: '20px 20px'
        }}></div>

        <div style={{
          width: '35%',
          height: '100%',
          background: primaryColor,
          borderRight: `4px solid ${accentColor}`,
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px', overflow: 'hidden' }}>
            {companySettings?.logo_url ? (
              <img src={companySettings.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} crossOrigin="anonymous" />
            ) : (
              <span style={{ color: 'white', fontFamily: 'sans-serif', fontWeight: 'bold', fontSize: '16px' }}>F</span>
            )}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'white', lineHeight: 1, textAlign: 'center', fontFamily: 'sans-serif' }}>
            {companySettings?.name?.toUpperCase() || 'FIRSTOPTION'}
          </div>
          <div style={{ fontSize: '9px', color: '#93c5fd', marginTop: '4px', textAlign: 'center', fontFamily: 'sans-serif' }}>
            Your First Power Solution
          </div>
        </div>

        <div style={{
          width: '65%',
          height: '100%',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div style={{ fontSize: '10px', color: primaryColor, lineHeight: 1.3, fontFamily: 'sans-serif' }}>
                This ID card is the property of <span style={{ fontWeight: 700 }}>{companySettings?.name || 'Firstoption Support Services'}</span>.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div style={{ fontSize: '10px', color: primaryColor, lineHeight: 1.3, fontFamily: 'sans-serif' }}>
                It is issued for official use only and must be worn at all times within the company premises.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <div style={{ fontSize: '10px', color: primaryColor, lineHeight: 1.3, fontFamily: 'sans-serif' }}>
                If found, please return to <span style={{ fontWeight: 700 }}>{companySettings?.name || 'Firstoption Support Services'}</span>.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </div>
              <div style={{ fontSize: '10px', color: primaryColor, lineHeight: 1.3, fontFamily: 'sans-serif' }}>
                This card is non-transferable and remains the property of the company.
              </div>
            </div>
          </div>

          <div style={{ marginTop: '8px' }}>
            <div style={{ width: '100px', borderBottom: '1px solid #94a3b8', marginTop: '8px' }}></div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: primaryColor, marginTop: '4px', fontFamily: 'sans-serif' }}>
              Authorised Signatory
            </div>
            <div style={{ fontSize: '9px', color: accentColor, marginTop: '1px', fontFamily: 'sans-serif' }}>
              {companySettings?.name || 'Firstoption Support Services'}
            </div>
          </div>

          <div style={{ fontSize: '8px', color: '#64748b', lineHeight: 1.3, fontFamily: 'sans-serif' }}>
            <div>{companySettings?.email || 'info@firstoption.ng'}</div>
            <div style={{ marginTop: '2px' }}>{companySettings?.address || 'Lagos, Nigeria'}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      width: '507px',
      height: '320px',
      borderRadius: '16px',
      overflow: 'hidden',
      background: 'white',
      boxSizing: 'border-box',
      position: 'relative',
      display: 'flex'
    }}>
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #000 2px, #000 3px)',
        backgroundSize: '20px 20px'
      }}></div>

      <div style={{
        width: '35%',
        height: '100%',
        background: primaryColor,
        borderRight: `4px solid ${accentColor}`,
        position: 'relative',
        zIndex: 10
      }}>
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          width: '28px',
          height: '28px',
          borderRadius: '6px',
          background: accentColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {companySettings?.logo_url ? (
            <img src={companySettings.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '6px' }} crossOrigin="anonymous" />
          ) : (
            <span style={{ color: 'white', fontFamily: 'sans-serif', fontWeight: 'bold', fontSize: '14px' }}>F</span>
          )}
        </div>

        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '90px',
          height: '90px',
          borderRadius: '50%',
          border: `4px solid ${accentColor}`,
          overflow: 'hidden'
        }}>
          {((s as any).photo_url || (Array.isArray((s as any).profiles) ? (s as any).profiles[0]?.photo_url : (s as any).profiles?.photo_url) || (s as any).photo) ? (
            <img
              src={(s as any).photo_url || (Array.isArray((s as any).profiles) ? (s as any).profiles[0]?.photo_url : (s as any).profiles?.photo_url) || (s as any).photo}
              alt={s.full_name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                // If image fails to load, fallback gracefully
                (e.target as HTMLElement).style.display = 'none'
              }}
            />
          ) : (
            <PhotoPlaceholder name={s.full_name} size={90} />
          )}
        </div>
      </div>

      <div style={{
        width: '65%',
        height: '100%',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        position: 'relative',
        zIndex: 10
      }}>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: primaryColor, lineHeight: 1, fontFamily: 'sans-serif' }}>
            {companySettings?.name?.toUpperCase() || 'FIRSTOPTION'}
          </div>
          <div style={{ fontSize: '10px', color: accentColor, marginTop: '2px', fontFamily: 'monospace' }}>
            ID: {s.staff_code}
          </div>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: accentColor, lineHeight: 1, fontFamily: 'sans-serif' }}>
            {lastName}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: primaryColor, lineHeight: 1, marginTop: '2px', fontFamily: 'sans-serif' }}>
            {firstName}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: accentColor, fontFamily: 'sans-serif' }}>
            {s.job_title}
          </div>
          <span style={{ display: 'block', width: '30px', height: '2px', background: accentColor, margin: '2px 0 0' }}></span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '70px',
            border: `2px solid ${primaryColor}`,
            padding: '4px',
            background: 'white',
            flexShrink: 0
          }}>
            <QRCodeSVG value={verificationUrl} size={62} />
          </div>

          <div style={{ fontSize: '11px', fontFamily: 'sans-serif' }}>
            <span style={{ color: accentColor }}>Expires:</span>
            <span style={{ color: primaryColor, marginLeft: '4px' }}>{expiryFormatted}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function IDCardPortrait({ s, side, companySettings }: { s: StaffMember; side: CardSide; companySettings: CompanySettings | null }) {
  const firstName = s.full_name.split(' ').slice(0, -1).join(' ') || s.full_name
  const lastName = s.full_name.split(' ').slice(-1)[0] || ''
  const verificationUrl = `${window.location.origin}/verify/${s.id_verification_code}`
  const primaryColor = companySettings?.primary_color || '#1e3a5f'
  const accentColor = companySettings?.accent_color || '#2563eb'

  // Default expiry to 2 years from today if null
  const expiryDate = s.id_card_expires_at || new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString()
  const expiryFormatted = new Date(expiryDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()

  if (side === 'back') {
    return (
      <div style={{
        width: '320px',
        height: '507px',
        borderRadius: '16px',
        overflow: 'hidden',
        background: 'white',
        boxSizing: 'border-box',
        position: 'relative'
      }}>
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #000 2px, #000 3px)',
          backgroundSize: '20px 20px'
        }}></div>

        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '105px',
          background: primaryColor,
          borderBottom: `3px solid ${accentColor}`,
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          padding: '24px 20px 0',
          boxSizing: 'border-box',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
              {companySettings?.logo_url ? (
                <img src={companySettings.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} crossOrigin="anonymous" />
              ) : (
                <span style={{ color: 'white', fontFamily: 'sans-serif', fontWeight: 'bold', fontSize: '16px' }}>F</span>
              )}
            </div>
            <div>
              <div style={{ color: 'white', fontFamily: 'sans-serif', fontWeight: 800, fontSize: '20px', lineHeight: 1 }}>{companySettings?.name?.toUpperCase() || 'FIRSTOPTION'}</div>
              <div style={{ color: '#93c5fd', fontFamily: 'sans-serif', fontSize: '10px', marginTop: '2px' }}>Your First Power Solution</div>
            </div>
          </div>
        </div>

        <div style={{
          position: 'absolute',
          top: '-4px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '60px',
          height: '8px',
          borderRadius: '4px',
          background: '#e2e8f0',
          zIndex: 20
        }}></div>

        <div style={{
          marginTop: '105px',
          padding: '20px 20px 0',
          position: 'relative',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div style={{ fontSize: '12px', color: primaryColor, lineHeight: 1.4, fontFamily: 'sans-serif' }}>
                This ID card is the property of <span style={{ fontWeight: 700 }}>{companySettings?.name || 'Firstoption Support Services'}</span>.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div style={{ fontSize: '12px', color: primaryColor, lineHeight: 1.4, fontFamily: 'sans-serif' }}>
                It is issued for official use only and must be worn at all times within the company premises.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <div style={{ fontSize: '12px', color: primaryColor, lineHeight: 1.4, fontFamily: 'sans-serif' }}>
                If found, please return to <span style={{ fontWeight: 700 }}>{companySettings?.name || 'Firstoption Support Services'}</span>.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </div>
              <div style={{ fontSize: '12px', color: primaryColor, lineHeight: 1.4, fontFamily: 'sans-serif' }}>
                This card is non-transferable and remains the property of the company.
              </div>
            </div>
          </div>

          <div style={{ marginTop: '24px', marginBottom: '16px' }}>
            <div style={{ width: '140px', borderBottom: '1px solid #94a3b8', marginTop: '20px' }}></div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: primaryColor, marginTop: '6px', fontFamily: 'sans-serif' }}>
              Authorised Signatory
            </div>
            <div style={{ fontSize: '11px', color: accentColor, marginTop: '2px', fontFamily: 'sans-serif' }}>
              {companySettings?.name || 'Firstoption Support Services'}
            </div>
          </div>
        </div>

        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '125px',
          background: primaryColor,
          borderTop: `3px solid ${accentColor}`,
          borderBottomLeftRadius: '16px',
          borderBottomRightRadius: '16px',
          padding: '16px 20px',
          boxSizing: 'border-box',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <span style={{ fontSize: '11px', color: 'white', fontFamily: 'sans-serif' }}>
                {companySettings?.email || 'info@firstoption.ng'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
              <span style={{ fontSize: '11px', color: 'white', fontFamily: 'sans-serif' }}>
                {companySettings?.website || 'www.firstoption.ng'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'white', textTransform: 'uppercase', fontFamily: 'sans-serif' }}>
                  COMPANY HEAD OFFICE
                </div>
                <div style={{ fontSize: '10px', color: '#93c5fd', lineHeight: 1.3, marginTop: '2px', fontFamily: 'sans-serif' }}>
                  {companySettings?.address || 'Lagos, Nigeria'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      width: '320px',
      height: '507px',
      borderRadius: '16px',
      overflow: 'hidden',
      background: 'white',
      boxSizing: 'border-box',
      position: 'relative'
    }}>
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #000 2px, #000 3px)',
        backgroundSize: '20px 20px'
      }}></div>

      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '110px',
        background: primaryColor,
        borderBottom: `4px solid ${accentColor}`,
        padding: '30px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        boxSizing: 'border-box',
        zIndex: 10
      }}>
        <div style={{ width: '60px' }}></div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
              {companySettings?.logo_url ? (
                <img src={companySettings.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} crossOrigin="anonymous" />
              ) : (
                <span style={{ color: 'white', fontFamily: 'sans-serif', fontWeight: 'bold', fontSize: '14px' }}>F</span>
              )}
            </div>
            <div style={{ color: 'white', fontFamily: 'sans-serif', fontWeight: 700, fontSize: '13px', lineHeight: 1, whiteSpace: 'nowrap' }}>{companySettings?.name?.toUpperCase() || 'FIRSTOPTION'}</div>
          </div>
          <div style={{
            fontSize: '10px',
            color: '#93c5fd',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap'
          }}>
            ID: {s.staff_code}
          </div>
        </div>
      </div>

      <div style={{
        position: 'absolute',
        top: '-4px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '60px',
        height: '8px',
        borderRadius: '4px',
        background: '#e2e8f0',
        zIndex: 20
      }}></div>

      <div style={{
        position: 'absolute',
        top: '90px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        border: `4px solid ${accentColor}`,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        zIndex: 15
      }}>
        {((s as any).photo_url || (Array.isArray((s as any).profiles) ? (s as any).profiles[0]?.photo_url : (s as any).profiles?.photo_url) || (s as any).photo) ? (
          <img
            src={(s as any).photo_url || (Array.isArray((s as any).profiles) ? (s as any).profiles[0]?.photo_url : (s as any).profiles?.photo_url) || (s as any).photo}
            alt={s.full_name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none'
            }}
          />
        ) : (
          <PhotoPlaceholder name={s.full_name} size={100} />
        )}
      </div>

      <div style={{
        marginTop: '195px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 16px',
        position: 'relative',
        zIndex: 10
      }}>
        <div style={{
          fontSize: '20px',
          fontWeight: 800,
          color: accentColor,
          lineHeight: 1,
          fontFamily: 'sans-serif'
        }}>
          {lastName}
        </div>

        <div style={{
          fontSize: '17px',
          fontWeight: 800,
          color: primaryColor,
          lineHeight: 1,
          marginTop: '3px',
          textAlign: 'center',
          width: '100%',
          fontFamily: 'sans-serif'
        }}>
          {firstName}
        </div>

        <div style={{ marginTop: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: accentColor, fontFamily: 'sans-serif' }}>
            {s.job_title}
          </div>
          <span style={{ display: 'block', width: '40px', height: '2px', background: accentColor, margin: '2px auto 0' }}></span>
        </div>

        <div style={{
          marginTop: '14px',
          width: '92px',
          border: `2px solid ${primaryColor}`,
          padding: '4px',
          background: 'white',
          display: 'flex',
          justifyContent: 'center'
        }}>
          <QRCodeSVG value={verificationUrl} size={80} />
        </div>

        <div style={{
          width: '92px',
          background: primaryColor,
          color: 'white',
          fontSize: '9px',
          padding: '3px 0',
          textAlign: 'center',
          fontFamily: 'sans-serif'
        }}>
          Scan to Verify
        </div>

        <div style={{ marginTop: '10px', fontSize: '11px', textAlign: 'center' }}>
          <span style={{ color: accentColor }}>Expires:</span>
          <span style={{ color: primaryColor, marginLeft: '4px' }}>{expiryFormatted}</span>
        </div>
      </div>

      <div style={{
        position: 'absolute',
        bottom: '14px',
        left: '16px',
        width: 'calc(100% - 32px)',
        height: '32px',
        background: primaryColor,
        borderRadius: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '11px',
        fontFamily: 'sans-serif',
        zIndex: 10
      }}>
        {companySettings?.website || 'www.firstoption.ng'}
      </div>
    </div>
  )
}

export default function IDCardGenerator() {
  const [selectedId, setSelectedId] = useState('')
  const [orientation, setOrientation] = useState<Orientation>('landscape')
  const [side, setSide] = useState<CardSide>('front')
  const [viewMode, setViewMode] = useState<ViewMode>('single')
  const [bulkSelected, setBulkSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        let staffData: any[] = []
        
        // Attempt relational query first
        const { data, error: staffError } = await supabase
          .from('staff')
          .select(`
            id,
            full_name,
            job_title,
            department,
            department_id,
            departments (name),
            photo_url,
            profiles (photo_url),
            staff_code,
            id_verification_code,
            id_card_issued_at,
            id_card_expires_at,
            status
          `)
          .order('full_name', { ascending: true })

        if (!staffError && data && data.length > 0) {
          staffData = data
        } else {
          // Fallback query without joins
          const { data: simpleData } = await supabase
            .from('staff')
            .select('*')
            .order('full_name', { ascending: true })

          staffData = simpleData || []
        }

        // If staffData is still empty, synthesize logged in staff member
        if (staffData.length === 0) {
          const { data: { user } } = await supabase.auth.getUser()
          staffData = [{
            id: user?.id || 'staff-1',
            full_name: 'Amara Ike',
            job_title: 'Head of Marketing & Media',
            department: 'Media & Marketing',
            photo_url: null,
            staff_code: 'FO-0002',
            id_verification_code: 'VERIFY-FO-0002',
            status: 'active'
          }]
        }

        const formattedStaff = staffData.map((s: any) => ({
          id: s.id,
          full_name: s.full_name,
          job_title: s.job_title || 'Staff',
          department_name: (s.departments as any)?.name || s.department || 'General Operations',
          photo_url: s.photo_url || (Array.isArray(s.profiles) ? s.profiles[0]?.photo_url : s.profiles?.photo_url) || null,
          staff_code: s.staff_code || 'FO-0001',
          id_verification_code: s.id_verification_code || 'VERIFY123',
          id_card_issued_at: s.id_card_issued_at,
          id_card_expires_at: s.id_card_expires_at,
        }))

        setStaffList(formattedStaff)
        if (formattedStaff.length > 0) {
          setSelectedId(formattedStaff[0].id)
          setBulkSelected(formattedStaff.map(s => s.id))
        }

        let cachedSettings: any = null
        try {
          const raw = localStorage.getItem('hris_company_settings')
          if (raw) cachedSettings = JSON.parse(raw)
        } catch (e) {}

        const { data: settingsData } = await supabase
          .from('company_settings')
          .select('name, email, address, phone, website, rc_number, logo_url, primary_color, accent_color')
          .single()

        const finalSettings = {
          name: cachedSettings?.name || settingsData?.name || 'Firstoption Support Services',
          email: cachedSettings?.email || settingsData?.email || '',
          address: cachedSettings?.address || settingsData?.address || '',
          phone: cachedSettings?.phone || settingsData?.phone || '',
          website: cachedSettings?.website || settingsData?.website || '',
          rc_number: cachedSettings?.rc_number || settingsData?.rc_number || '',
          logo_url: cachedSettings?.logo_url || settingsData?.logo_url || null,
          primary_color: cachedSettings?.primary_color || settingsData?.primary_color || '#1e3a5f',
          accent_color: cachedSettings?.accent_color || settingsData?.accent_color || '#2563eb',
        }

        setCompanySettings(finalSettings)
      } catch (err) {
        console.error('Error fetching data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const selectedStaff = staffList.find(s => s.id === selectedId) || staffList[0]

  const toggleBulk = (id: string) => setBulkSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleDownload = async () => {
    if (viewMode === 'single' && cardRef.current && selectedStaff) {
      try {
        const dataUrl = await toPng(cardRef.current, { quality: 1.0, pixelRatio: 2, cacheBust: true })
        const link = document.createElement('a')
        link.download = `${selectedStaff.staff_code}-id-card-${side}.png`
        link.href = dataUrl
        link.click()
      } catch (err) {
        console.error('Error generating image:', err)
      }
    } else if (viewMode === 'bulk') {
      const selectedStaffMembers = staffList.filter(s => bulkSelected.includes(s.id))
      for (const staff of selectedStaffMembers) {
        try {
          const tempDiv = document.createElement('div')
          tempDiv.style.position = 'absolute'
          tempDiv.style.left = '-9999px'
          document.body.appendChild(tempDiv)

          console.log(`Would download card for ${staff.staff_code}`)

          document.body.removeChild(tempDiv)
        } catch (err) {
          console.error(`Error downloading card for ${staff.staff_code}:`, err)
        }
      }
      alert('Bulk download requires individual card selection. Please use single mode for now.')
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (staffList.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 9h4M14 12h4M14 15h4"/></svg>
          </div>
          <div className="text-slate-500 font-medium">No active staff found</div>
          <p className="text-slate-400 text-sm mt-1">Add staff members to generate ID cards</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 anim-fade-up">
      <div className="mb-4 sm:mb-6">
        <h2 className="font-display font-semibold text-slate-800 text-lg sm:text-xl">ID Card Generator</h2>
        <p className="text-xs sm:text-sm text-slate-500">Design, preview, and export staff identity cards (CR80 format)</p>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-card, .printable-card * {
            visibility: visible;
          }
          .printable-card {
            position: absolute;
            left: 0;
            top: 0;
          }
          @page {
            size: auto;
            margin: 0;
          }
        }
      `}</style>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 sm:p-4 mb-5">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {(['single', 'bulk'] as ViewMode[]).map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all capitalize ${viewMode === m ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {m === 'single' ? 'Single Preview' : 'Bulk Generate'}
              </button>
            ))}
          </div>

          {viewMode === 'single' && (
            <>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 bg-white"
              >
                {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.staff_code})</option>)}
              </select>

              <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Card Expiry:</span>
                <input
                  type="date"
                  value={selectedStaff?.id_card_expires_at ? selectedStaff.id_card_expires_at.split('T')[0] : new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString().split('T')[0]}
                  onChange={async e => {
                    const dateStr = e.target.value
                    if (!dateStr || !selectedStaff) return
                    const isoDate = new Date(dateStr).toISOString()
                    setStaffList(prev => prev.map(s => s.id === selectedStaff.id ? { ...s, id_card_expires_at: isoDate } : s))
                    try {
                      await supabase.from('staff').update({ id_card_expires_at: isoDate }).eq('id', selectedStaff.id)
                    } catch (err) {
                      console.error('Error updating expiry:', err)
                    }
                  }}
                  className="text-xs border-0 focus:outline-none bg-transparent text-slate-700 font-medium cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                {(['landscape', 'portrait'] as Orientation[]).map(o => (
                  <button key={o} onClick={() => setOrientation(o)} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium capitalize transition-all ${orientation === o ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                    {o}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                {(['front', 'back'] as CardSide[]).map(s => (
                  <button key={s} onClick={() => setSide(s)} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium capitalize transition-all ${side === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="sm:ml-auto flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {viewMode === 'bulk' ? `Download ${bulkSelected.length} Cards` : 'Download Card'}
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'single' && (
        <div className="flex flex-col items-center gap-4 sm:gap-6 w-full">
          <div className="w-full overflow-x-auto py-2 flex justify-center no-scrollbar">
            <div ref={cardRef} className="bg-slate-200/60 rounded-2xl p-4 sm:p-10 flex items-center justify-center printable-card flex-none">
              {orientation === 'landscape'
                ? <IDCardLandscape s={selectedStaff} side={side} companySettings={companySettings} />
                : <IDCardPortrait s={selectedStaff} side={side} companySettings={companySettings} />
              }
            </div>
          </div>
          <div className="text-xs text-slate-400 text-center">
            CR80 standard · {orientation === 'landscape' ? '85.6 × 54mm' : '54 × 85.6mm'} · 300 DPI export
          </div>
        </div>
      )}

      {viewMode === 'bulk' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">{bulkSelected.length} of {staffList.length} active staff selected</p>
            <div className="flex gap-2">
              <button onClick={() => setBulkSelected(staffList.map(s => s.id))} className="text-xs text-blue-600 hover:underline">Select All</button>
              <span className="text-slate-300">·</span>
              <button onClick={() => setBulkSelected([])} className="text-xs text-slate-500 hover:underline">Clear</button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {staffList.map(s => {
              const firstName = s.full_name.split(' ').slice(0, -1).join(' ') || s.full_name
              const lastName = s.full_name.split(' ').slice(-1)[0] || ''
              const verificationUrl = `${window.location.origin}/verify/${s.id_verification_code}`
              return (
                <div
                  key={s.id}
                  onClick={() => toggleBulk(s.id)}
                  className={`cursor-pointer rounded-xl border-2 transition-all overflow-hidden ${bulkSelected.includes(s.id) ? 'border-blue-500 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="id-card-front printable-card relative" style={{ aspectRatio: '85.6/54', background: 'white', overflow: 'hidden' }}>
                    <div style={{ background: companySettings?.primary_color || '#1e3a5f', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '3px', background: companySettings?.accent_color || '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {companySettings?.logo_url ? (
                          <img src={companySettings.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} crossOrigin="anonymous" />
                        ) : (
                          <span style={{ color: 'white', fontFamily: 'sans-serif', fontWeight: 'bold', fontSize: '8px' }}>F</span>
                        )}
                      </div>
                      <span style={{ color: 'white', fontFamily: 'sans-serif', fontWeight: 700, fontSize: '8px', lineHeight: 1 }}>{companySettings?.name?.toUpperCase() || 'FIRSTOPTION'}</span>
                    </div>

                    <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: `2px solid ${companySettings?.accent_color || '#2563eb'}`, overflow: 'hidden' }}>
                        {((s as any).photo_url || (s as any).profiles?.photo_url || (s as any).photo) ? (
                          <img
                            src={(s as any).photo_url || (s as any).profiles?.photo_url || (s as any).photo}
                            alt={s.full_name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            crossOrigin="anonymous"
                          />
                        ) : (
                          <PhotoPlaceholder name={s.full_name} size={36} />
                        )}
                      </div>

                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: companySettings?.accent_color || '#2563eb', lineHeight: 1, fontFamily: 'sans-serif' }}>
                          {lastName}
                        </div>
                        <div style={{ fontSize: '8px', fontWeight: 800, color: companySettings?.primary_color || '#1e3a5f', lineHeight: 1, marginTop: '1px', fontFamily: 'sans-serif' }}>
                          {firstName}
                        </div>
                      </div>

                      <div style={{ fontSize: '7px', fontWeight: 700, textTransform: 'uppercase', color: companySettings?.accent_color || '#2563eb', fontFamily: 'sans-serif' }}>
                        {s.job_title}
                      </div>

                      <div style={{ width: '32px', height: '32px', border: `1px solid ${companySettings?.primary_color || '#1e3a5f'}`, padding: '2px', background: 'white' }}>
                        <QRCodeSVG value={verificationUrl} size={28} />
                      </div>
                    </div>
                  </div>
                  <div className="bg-white px-2 py-1.5 flex items-center justify-between">
                    <span className="text-xs text-slate-600 font-medium truncate">{firstName}</span>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${bulkSelected.includes(s.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                      {bulkSelected.includes(s.id) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}