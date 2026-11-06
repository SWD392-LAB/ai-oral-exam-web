// A CSV stands in for the school template until the export format is decided (see PENDING.exportFormat).
export function downloadGradeSheet(name, rows) {
  const lines = [['Student code', 'Name', 'Final score', 'Status']].concat(
    rows.map((r) => [r.studentCode, r.fullName, r.finalScore ?? '', r.status === 'Finalized' ? 'Final' : r.status === 'NoAttempt' ? 'No attempt' : 'Pending']),
  )
  const csv = lines.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `${name}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
