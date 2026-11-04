// Excelが日本語を判別できるようUTF-8 BOMを付け、Windows標準の改行にします。
// カンマ・改行・引用符はCSVの引用規則で保持します。
export function makeCsv(rows: (string | number)[][]): string {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = String(value)
    // 自由入力の名前・メモをExcelの数式として実行させないようにします。
    if (typeof value === 'string' && (/^[\s]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text))) text = "'" + text
    return '"' + text.replaceAll('"', '""') + '"'
  }).join(',')).join('\r\n') + '\r\n'
}

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const url = URL.createObjectURL(new Blob([makeCsv(rows)], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // ダウンロードが始まる前にURLを解放しないよう、少し後に破棄します。
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
