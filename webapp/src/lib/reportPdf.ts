import type { jsPDF } from 'jspdf'

export type ReportPdfInput = {
  title: string
  context: string
  columns: string[]
  rows: string[][]
  summary?: { label: string; value: string }
  page: number
  totalPages: number
  totalRows: number
}

const PT_PER_MM = 72 / 25.4
const LATIN1 = /^[\u0020-\u00ff]*$/
const VIOLET = '#664cf0'
const INK = '#241a45'
const MUTED = '#625c75'
const LINE = '#e5e0f2'

function wrapCanvasText(text: string, maxWidth: number, context: CanvasRenderingContext2D) {
  const output: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      output.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (line && context.measureText(next).width > maxWidth) {
        output.push(line)
        line = word
      } else {
        line = next
      }
    }
    output.push(line)
  }
  return output.length ? output : ['']
}

function linesFor(doc: jsPDF, text: string, widthMm: number, fontSize: number, bold = false) {
  if (LATIN1.test(text)) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(fontSize)
    return doc.splitTextToSize(text || ' ', widthMm) as string[]
  }
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return [text]
  const fontPixels = fontSize / PT_PER_MM * 8
  context.font = `${bold ? 700 : 400} ${fontPixels}px Arial, sans-serif`
  return wrapCanvasText(text || ' ', widthMm * 8, context)
}

function drawCellText(doc: jsPDF, text: string, xMm: number, baselineMm: number, widthMm: number, fontSize: number, color: string, bold = false) {
  const lines = linesFor(doc, text, widthMm, fontSize, bold)
  const lineHeightMm = fontSize / PT_PER_MM * 1.35
  if (LATIN1.test(text)) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(fontSize)
    doc.setTextColor(color)
    doc.text(lines, xMm, baselineMm, { lineHeightFactor: 1.35 })
    return lines.length * lineHeightMm
  }

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return lines.length * lineHeightMm
  const pxPerMm = 8
  const fontPixels = fontSize / PT_PER_MM * pxPerMm
  const canvasWidth = Math.max(1, Math.ceil(widthMm * pxPerMm))
  const linePixels = Math.ceil(fontPixels * 1.35)
  canvas.width = canvasWidth
  canvas.height = Math.max(linePixels, lines.length * linePixels)
  context.font = `${bold ? 700 : 400} ${fontPixels}px Arial, sans-serif`
  context.fillStyle = color
  context.textBaseline = 'alphabetic'
  lines.forEach((line, index) => context.fillText(line, 0, fontPixels + index * linePixels, canvasWidth))
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', xMm, baselineMm - fontSize / PT_PER_MM, widthMm, canvas.height / pxPerMm)
  return lines.length * lineHeightMm
}

function drawPageHeading(doc: jsPDF, input: ReportPdfInput, page: number, margin: number, contentWidth: number, pageWidth: number, pageHeight: number) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(INK)
  doc.text(input.title, margin, margin + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(MUTED)
  doc.text(input.context, margin, margin + 13)
  doc.text(`Showing page ${input.page} of ${input.totalPages} · ${input.totalRows} matching rows`, margin, margin + 18)
  if (input.summary) {
    doc.setFillColor('#f0edff')
    doc.roundedRect(margin, margin + 21, contentWidth, 10, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(INK)
    doc.text(input.summary.label, margin + 3, margin + 27.2)
    const summaryWidth = doc.getTextWidth(input.summary.value)
    doc.text(input.summary.value, pageWidth - margin - 3 - summaryWidth, margin + 27.2)
  }
  const tableTop = margin + (input.summary ? 35 : 25)
  return { tableTop, footerY: pageHeight - margin + 2 }
}

/** Build a print-ready PDF of exactly the rows currently visible on the report page. */
export async function buildReportPdf(input: ReportPdfInput) {
  const { jsPDF: PDF } = await import('jspdf')
  const orientation = input.columns.length > 5 ? 'landscape' : 'portrait'
  const doc = new PDF({ orientation, unit: 'mm', format: 'a4', compress: true })
  const margin = 12
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - margin * 2
  const columnWidth = contentWidth / Math.max(input.columns.length, 1)
  const fontSize = input.columns.length > 7 ? 6.2 : input.columns.length > 4 ? 6.8 : 7.6
  const cellPaddingX = 1.6
  const cellPaddingY = 1.8
  const bodyWidth = Math.max(columnWidth - cellPaddingX * 2, 5)
  const preparedRows = input.rows.map((row) => {
    const cells = input.columns.map((_, index) => {
      const text = row[index] ?? '—'
      const lines = linesFor(doc, text, bodyWidth, fontSize)
      return { text, lines, lineCount: Math.max(lines.length, 1) }
    })
    const lineCount = Math.max(...cells.map((cell) => cell.lineCount), 1)
    return { cells, height: Math.max(7, lineCount * fontSize / PT_PER_MM * 1.35 + cellPaddingY * 2) }
  })

  const renderHeader = (page: number) => {
    const { tableTop } = drawPageHeading(doc, input, page, margin, contentWidth, pageWidth, pageHeight)
    const headerHeight = Math.max(9, fontSize / PT_PER_MM * 1.35 + cellPaddingY * 2)
    doc.setFillColor(VIOLET)
    doc.rect(margin, tableTop, contentWidth, headerHeight, 'F')
    input.columns.forEach((column, index) => {
      drawCellText(doc, column, margin + index * columnWidth + cellPaddingX, tableTop + cellPaddingY + fontSize / PT_PER_MM, bodyWidth, fontSize, '#ffffff', true)
    })
    doc.setDrawColor(LINE)
    doc.setLineWidth(0.15)
    for (let index = 0; index <= input.columns.length; index += 1) {
      const x = margin + index * columnWidth
      doc.line(x, tableTop, x, tableTop + headerHeight)
    }
    doc.line(margin, tableTop + headerHeight, pageWidth - margin, tableTop + headerHeight)
    return { y: tableTop + headerHeight, footerY: pageHeight - margin + 2 }
  }

  let pageNumber = 1
  let { y, footerY } = renderHeader(pageNumber)
  for (const [rowIndex, row] of preparedRows.entries()) {
    if (y + row.height > footerY - 5) {
      doc.addPage('a4', orientation)
      pageNumber += 1
      ;({ y, footerY } = renderHeader(pageNumber))
    }
    if (rowIndex % 2 === 1) {
      doc.setFillColor('#faf9fd')
      doc.rect(margin, y, contentWidth, row.height, 'F')
    }
    row.cells.forEach((cell, columnIndex) => {
      drawCellText(doc, cell.text, margin + columnIndex * columnWidth + cellPaddingX, y + cellPaddingY + fontSize / PT_PER_MM, bodyWidth, fontSize, INK)
    })
    doc.setDrawColor(LINE)
    doc.setLineWidth(0.12)
    doc.line(margin, y + row.height, pageWidth - margin, y + row.height)
    for (let index = 0; index <= input.columns.length; index += 1) {
      const x = margin + index * columnWidth
      doc.line(x, y, x, y + row.height)
    }
    y += row.height
  }

  for (let index = 1; index <= doc.getNumberOfPages(); index += 1) {
    doc.setPage(index)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(MUTED)
    doc.text(`Epic Laundry · Page ${index} of ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 5, { align: 'right' })
  }
  doc.setProperties({ title: input.title, subject: input.context, creator: 'Epic Laundry' })
  return doc
}

export async function downloadReportPdf(input: ReportPdfInput, filename: string) {
  const document = await buildReportPdf(input)
  document.save(filename)
}
