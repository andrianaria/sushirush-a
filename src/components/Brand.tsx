export function Sun({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 100 100" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="3">{Array.from({ length: 16 }, (_, i) => <path key={i} d="M50 2v13" transform={`rotate(${i * 22.5} 50 50)`} />)}</g><circle cx="50" cy="50" r="27" fill="currentColor" /></svg>;
}

export function SushiIcon({ kind = 'roll', className = '' }: { kind?: string; className?: string }) {
  const bowl = kind === 'ramen';
  return <svg viewBox="0 0 80 64" className={`sushi-icon ${className}`} fill="none" aria-hidden="true">{bowl ? <><path d="M9 30h62c-3 23-14 29-31 29S12 53 9 30Z" fill="#e55549"/><ellipse cx="40" cy="30" rx="31" ry="12" fill="#f8ce58"/><path d="M18 31c4-14 10 13 16-2s10 12 16-2 9 5 12 1" stroke="#fffdf7" strokeWidth="3"/><ellipse cx="47" cy="26" rx="8" ry="6" fill="#fffdf7"/><ellipse cx="47" cy="26" rx="4" ry="3" fill="#f8ce58"/><path d="m28 15 15-13M38 17 55 3" stroke="#815735" strokeWidth="3" strokeLinecap="round"/><path d="m24 29 2 5m29 1 2-6" stroke="#38503b" strokeWidth="4"/></> : <><ellipse cx="40" cy="53" rx="33" ry="7" fill="#000" opacity=".09"/><path d="M16 20h48v23c0 10-48 10-48 0V20Z" fill="#263e32"/><ellipse cx="40" cy="21" rx="24" ry="16" fill="#fffdf7"/><ellipse cx="40" cy="21" rx="18" ry="11" fill="#e55549"/><path d="m30 16 18 10m-13-15 19 10" stroke="#f7bb91" strokeWidth="3"/><path d="m27 26 5-6 5 7" fill="#79b9a9"/><path d="m44 14 8 2-1 9-8-1" fill="#f8ce58"/><path d="M20 34v8m5-5v7m32-12v8" stroke="#466349" strokeWidth="2"/></>}</svg>;
}

export default function Brand({ small = false }: { small?: boolean }) {
  return <span className={`brand ${small ? 'small' : ''}`}><img className="brand-logo" src={`${import.meta.env.BASE_URL}sushi-rush-logo.svg`} alt="Sushi Rush 60" width={small ? 90 : 122}/></span>;
}
