import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { apiGet, apiPost } from '@/lib/api'
import VisualEmptyState from '@/components/laundry/VisualEmptyState'

type ImportMode = 'customers' | 'prices'
type ImportRow = Record<string, string | number>
type ParsedImportRow = { worksheetRow: number; values: ImportRow }
type ImportIssue = { row: number; message: string; values?: ImportRow }
type ImportPreview = { totalRows: number; readyRows: number; errors: Array<{ row: number; message: string }> }
type ImportResult = { created: number; updated: number; skipped: number; errors: ImportIssue[]; job?: { id: string; status: string } }
type ImportJob = { id: string; importType: ImportMode; status: string; totalRows: number; createdRows: number; updatedRows: number; skippedRows: number; errors: Array<{ row: number; message: string }>; completedAt: string; actor: string }
type CommitRequest = { rows: ImportRow[]; sourceRows: ParsedImportRow[] }

const CUSTOMER_HEADERS = ['Customer Name', 'Phone', 'Email', 'Address']
const PRICE_HEADERS = ['Garment', 'Category', 'Service', 'Rate', 'Unit', 'HSN', 'GST Rate', 'Customer Phone']
const CUSTOMER_TEMPLATE = [CUSTOMER_HEADERS]
const PRICE_TEMPLATE = [PRICE_HEADERS]

export default function LaundryImport({ mode }: { mode: ImportMode }) {
  const client = useQueryClient()
  const [rows, setRows] = useState<ParsedImportRow[]>([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const label = mode === 'customers' ? 'Import Customers' : 'Import Garment Price'
  const jobs = useQuery({
    queryKey: ['laundry-import-jobs', mode],
    queryFn: () => apiGet<ImportJob[]>('/laundry/import/jobs?type=' + mode),
  })
  const previewMutation = useMutation({
    mutationFn: (payload: { type: ImportMode; rows: ImportRow[] }) =>
      apiPost<ImportPreview>('/laundry/import/preview', payload),
  })
  const mutation = useMutation({
    mutationFn: (request: CommitRequest) => apiPost<ImportResult>('/laundry/import/' + mode, { rows: request.rows }),
    onSuccess: (next, request) => {
      setResult({
        ...next,
        errors: next.errors.map((issue) => {
          const source = request.sourceRows[issue.row - 2]
          return { ...issue, row: source?.worksheetRow ?? issue.row, values: source?.values }
        }),
      })
      client.invalidateQueries({ queryKey: ['laundry-catalogue'] })
      client.invalidateQueries({ queryKey: ['laundry-customers'] })
      client.invalidateQueries({ queryKey: ['laundry-dashboard'] })
      client.invalidateQueries({ queryKey: ['laundry-import-jobs', mode] })
    },
  })

  const preview = previewMutation.data ?? null
  const invalidRows = new Set((preview?.errors || []).map((issue) => issue.row))
  const readyRows = rows.filter((row) => !invalidRows.has(row.worksheetRow))
  const correctionRows = (preview?.errors || []).map((issue) => ({
    ...issue,
    values: rows.find((row) => row.worksheetRow === issue.row)?.values,
  }))

  async function handleFile(file: File) {
    setParseError('')
    setResult(null)
    setRows([])
    previewMutation.reset()
    mutation.reset()
    setFileName(file.name)
    try {
      const extension = file.name.split('.').pop()?.toLowerCase()
      if (!extension || !['xls', 'xlsx', 'csv'].includes(extension)) {
        throw new Error('Choose an .xls, .xlsx or .csv spreadsheet.')
      }
      const sourceRows = await readSpreadsheet(file)
      const parsed = sourceRows
        .map((row, index) => ({
          worksheetRow: index + 2,
          values: mode === 'customers' ? customerRow(row) : priceRow(row),
        }))
        .filter((row) => Object.values(row.values).some((value) => String(value).trim()))
      if (parsed.length === 0) throw new Error('No data rows were found. Add your data under the downloaded sample headings.')
      if (parsed.length > 2_000) throw new Error('A maximum of 2,000 rows can be imported at one time.')
      setRows(parsed)
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'The spreadsheet could not be read.')
    }
  }

  function removeSelectedFile() {
    setFileName('')
    setRows([])
    setParseError('')
    setResult(null)
    previewMutation.reset()
    mutation.reset()
  }

  function validateFile() {
    setResult(null)
    previewMutation.mutate({ type: mode, rows: rows.map((row) => row.values) })
  }

  function importReadyRows() {
    mutation.mutate({ rows: readyRows.map((row) => row.values), sourceRows: readyRows })
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4d8982]">Controlled bulk update</p>
          <h1 className="mt-1 font-serif text-3xl text-[#17353c]">{label}</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#718087]">
            Download the sample headings, choose a spreadsheet, then validate and review every row before importing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void downloadTemplate(mode)}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#2c655f]/25 bg-white px-4 py-2.5 text-sm font-bold text-[#215851]"
        >
          <Download className="h-4 w-4" /> Download Sample
        </button>
      </header>

      <ol aria-label="Import steps" className="mt-5 grid gap-2 sm:grid-cols-3">
        {['1 · Download sample', '2 · Select file', '3 · Validate, review & import'].map((step, index) => {
          const complete = index === 0 || (index === 1 && Boolean(fileName) && !parseError) || (index === 2 && Boolean(preview))
          return (
            <li key={step} className={'rounded-xl border px-3 py-2 text-xs font-bold ' + (complete ? 'border-[#4d8982]/20 bg-[#eaf3ef] text-[#315f5b]' : 'border-[#263f44]/10 bg-white text-[#718087]')}>
              {step}
            </li>
          )
        })}
      </ol>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-[24px] border border-dashed border-[#4d8982]/40 bg-[#f6faf7] p-6">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#dceee8] text-[#276e65]">
            <FileSpreadsheet className="h-5 w-5" />
          </span>
          <h2 className="mt-4 font-serif text-2xl text-[#17353c]">Select Excel File</h2>
          <p className="mt-1 text-sm text-[#718087]">
            Choose an .xls or .xlsx spreadsheet. CSV files are also supported. The sample contains headings only, so add your own data rows.
            {' '}{mode === 'prices'
              ? 'Prices can be assigned to existing garments; create a new garment in Garments first so it has an approved visual.'
              : 'A matching phone updates the existing customer; a new phone creates one.'}
          </p>
          <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#123039] px-4 py-2.5 text-sm font-bold text-white">
            <Upload className="h-4 w-4" /> Choose file
            <input
              key={fileName}
              aria-label="Select Excel file"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleFile(file)
              }}
            />
          </label>
          {fileName ? (
            <>
              <p className="mt-4 text-sm font-semibold text-[#315f5b]">{fileName} · {rows.length} row{rows.length === 1 ? '' : 's'} ready</p>
              {rows.length > 0 ? (
                <button
                  type="button"
                  disabled={previewMutation.isPending}
                  onClick={validateFile}
                  className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#241a45] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
                >
                  {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {previewMutation.isPending ? 'Checking rows…' : 'Validate and preview'}
                </button>
              ) : null}
              <button type="button" onClick={removeSelectedFile} className="mt-3 block text-xs font-bold text-[#39786f] underline">
                Remove selected file
              </button>
            </>
          ) : null}
          {parseError ? <Message text={parseError} /> : null}
          {previewMutation.isError ? <Message text={previewMutation.error instanceof Error ? previewMutation.error.message : 'The spreadsheet could not be validated.'} /> : null}
          {mutation.isError ? <Message text={mutation.error instanceof Error ? mutation.error.message : 'The import could not be saved.'} /> : null}
        </div>
        <Instructions mode={mode} />
      </section>

      {preview ? (
        <section role="status" className="mt-5 rounded-2xl border border-[#263f44]/10 bg-white p-4">
          <p className="font-semibold text-[#17353c]">
            {preview.readyRows} of {preview.totalRows} rows passed checks · {preview.errors.length} need correction
          </p>
          <p className="mt-1 text-xs leading-5 text-[#718087]">
            Rows marked for correction will not be submitted. The server checks each row again when you import.
          </p>
        </section>
      ) : null}

      {preview && correctionRows.length > 0 && !result ? (
        <CorrectionList
          issues={correctionRows}
          mode={mode}
          title="Fix these rows before importing them"
          detail="Download this file, correct the listed rows, and select it again. The original spreadsheet row values are included."
        />
      ) : null}

      {preview && !result && readyRows.length > 0 ? (
        <section className="mt-5 overflow-hidden rounded-[24px] border border-[#263f44]/10 bg-white shadow-[0_8px_28px_rgba(37,48,43,.04)]">
          <div className="flex flex-col gap-3 border-b border-[#263f44]/10 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-xl text-[#17353c]">Review {readyRows.length} valid row{readyRows.length === 1 ? '' : 's'}</h2>
              <p className="mt-1 text-xs text-[#718087]">Only these validated rows will be submitted.</p>
            </div>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={importReadyRows}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#3a7d78] px-4 text-sm font-bold text-white disabled:bg-[#a8b7b2]"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import {readyRows.length} valid row{readyRows.length === 1 ? '' : 's'}
            </button>
          </div>
          <Preview rows={readyRows} />
        </section>
      ) : null}

      {preview && !result && readyRows.length === 0 ? (
        <section role="status" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No rows can be imported yet. Download the correction file, fix the listed rows, and select the corrected file.
        </section>
      ) : null}

      {result ? <ImportOutcome result={result} mode={mode} /> : null}
      <ImportHistory jobs={jobs.data || []} loading={jobs.isLoading} />
    </div>
  )
}

function Instructions({ mode }: { mode: ImportMode }) {
  const heading = mode === 'customers' ? 'Customer columns' : 'Price columns'
  const columns = mode === 'customers'
    ? ['Customer Name*', 'Phone*', 'Email', 'Address']
    : ['Garment*', 'Category', 'Service*', 'Rate*', 'Unit', 'HSN', 'GST Rate', 'Customer Phone']
  return (
    <aside className="rounded-[24px] bg-[#123039] p-6 text-[#edf3ec]">
      <UsersRound className="h-5 w-5 text-[#f1ca75]" />
      <p className="mt-4 font-serif text-xl">{heading}</p>
      <ul className="mt-3 grid gap-2 text-sm text-[#c8dcd4]">
        {columns.map((column) => <li key={column} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#f1ca75]" />{column}</li>)}
      </ul>
      {mode === 'prices' ? (
        <p className="mt-3 text-xs leading-5 text-[#c8dcd4]">Create new garments in Garments first so each one has an approved visual.</p>
      ) : null}
      <p className="mt-5 border-t border-white/15 pt-4 text-xs leading-5 text-[#b8d3c8]">
        Invalid rows are held out before import and returned with their worksheet row number. Correct them and upload the correction file again.
      </p>
    </aside>
  )
}

function Preview({ rows }: { rows: ParsedImportRow[] }) {
  const headings = Object.keys(rows[0]?.values || {})
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="bg-[#fafaf7] text-[10px] font-bold uppercase tracking-[.14em] text-[#718087]">
          <tr><th scope="col" className="px-4 py-3">Worksheet row</th>{headings.map((heading) => <th scope="col" key={heading} className="px-5 py-3">{heading}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((row) => (
            <tr key={row.worksheetRow} className="border-t border-[#263f44]/8">
              <td className="px-4 py-3.5 text-xs text-[#718087]">{row.worksheetRow}</td>
              {headings.map((heading) => <td key={heading} className="px-5 py-3.5 text-[#43565a]">{String(row.values[heading] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 5 ? <p className="border-t border-[#263f44]/8 px-5 py-3 text-xs text-[#718087]">Previewing the first 5 valid rows.</p> : null}
    </div>
  )
}

function CorrectionList({ issues, mode, title, detail }: { issues: ImportIssue[]; mode: ImportMode; title: string; detail: string }) {
  return (
    <section className="mt-5 rounded-2xl border border-amber-200 bg-[#fff7e9] p-4 text-sm text-[#815411]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">{title}</h2>
          <p className="mt-1 text-xs leading-5">{detail}</p>
        </div>
        <button
          type="button"
          onClick={() => downloadRejectedRows(issues, mode)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#b77928]/25 bg-white px-2.5 py-1.5 text-xs font-bold text-[#815411]"
        >
          <Download className="h-3.5 w-3.5" /> Download rows to correct
        </button>
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        {issues.slice(0, 20).map((issue) => <li key={issue.row + '-' + issue.message}>Row {issue.row}: {issue.message}</li>)}
        {issues.length > 20 ? <li>{issues.length - 20} more rows are included in the correction file.</li> : null}
      </ul>
    </section>
  )
}

function ImportOutcome({ result, mode }: { result: ImportResult; mode: ImportMode }) {
  const clean = result.errors.length === 0
  return (
    <section className="mt-5 rounded-[24px] border border-[#263f44]/10 bg-white p-5 shadow-[0_8px_28px_rgba(37,48,43,.04)]">
      <div className="flex items-center gap-2 text-[#17353c]">
        {clean ? <CheckCircle2 className="h-5 w-5 text-[#3a7d78]" /> : <AlertTriangle className="h-5 w-5 text-[#b77928]" />}
        <h2 className="font-serif text-xl">Import result</h2>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Outcome label="Created" value={result.created} tone="green" />
        <Outcome label="Updated" value={result.updated} tone="blue" />
        <Outcome label="Skipped" value={result.skipped} tone="amber" />
      </div>
      {result.errors.length ? (
        <CorrectionList
          issues={result.errors}
          mode={mode}
          title="Some rows still need correction"
          detail="These rows were not saved. The correction file includes their original values and worksheet row numbers."
        />
      ) : (
        <p className="mt-4 text-sm text-[#42706a]">Every submitted row was saved. Rows held out during review were not submitted.</p>
      )}
    </section>
  )
}

function ImportHistory({ jobs, loading }: { jobs: ImportJob[]; loading: boolean }) {
  return (
    <section className="mt-5 overflow-hidden rounded-[24px] border border-[#263f44]/10 bg-white shadow-[0_8px_28px_rgba(37,48,43,.04)]">
      <div className="border-b border-[#263f44]/10 p-5">
        <p className="font-serif text-xl text-[#17353c]">Recent import jobs</p>
        <p className="mt-1 text-xs text-[#718087]">Local audit evidence of each completed spreadsheet write.</p>
      </div>
      {loading ? <div className="p-5 text-sm text-[#718087]">Loading import history…</div> : jobs.length ? (
        <div className="divide-y divide-[#263f44]/8">
          {jobs.slice(0, 6).map((job) => (
            <div key={job.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4 text-sm">
              <span className="min-w-44 font-semibold text-[#31484d]">{new Date(job.completedAt || Date.now()).toLocaleString()}</span>
              <span className={job.errors.length ? 'rounded-full bg-[#fff4dc] px-2 py-1 text-xs font-bold text-[#8a5a14]' : 'rounded-full bg-[#e9f5ed] px-2 py-1 text-xs font-bold text-[#287061]'}>{job.status}</span>
              <span className="text-[#617178]">{job.createdRows} created · {job.updatedRows} updated · {job.skippedRows} skipped</span>
              {job.errors.length ? (
                <button type="button" onClick={() => downloadErrorSummary(job.errors)} className="ml-auto text-xs font-bold text-[#39786f]">
                  Download error summary
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : <VisualEmptyState kind="operations" compact title="No import history yet" detail="Your first reviewed spreadsheet write will appear here with its local audit result." />}
    </section>
  )
}

function Outcome({ label, value, tone }: { label: string; value: number; tone: 'green' | 'blue' | 'amber' }) {
  const color = tone === 'green' ? 'bg-[#e9f5ed] text-[#287061]' : tone === 'blue' ? 'bg-[#e9f2f8] text-[#276582]' : 'bg-[#fff4dc] text-[#8a5a14]'
  return <div className={'rounded-xl p-4 ' + color}><p className="text-xs font-bold uppercase tracking-[.13em]">{label}</p><p className="mt-1 font-serif text-3xl">{value}</p></div>
}

function Message({ text }: { text: string }) {
  return <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{text}</p>
}

function key(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, '') }
function value(row: Record<string, unknown>, names: string[]) {
  const entries = new Map(Object.entries(row).map(([name, cell]) => [key(name), cell]))
  for (const name of names) {
    const found = entries.get(key(name))
    if (found !== undefined) return String(found).trim()
  }
  return ''
}
function customerRow(row: Record<string, unknown>): ImportRow {
  return {
    name: value(row, ['Customer Name', 'Name']),
    phone: value(row, ['Phone', 'Mobile', 'Phone Number']),
    email: value(row, ['Email', 'Email Address']),
    address: value(row, ['Address']),
  }
}
function priceRow(row: Record<string, unknown>): ImportRow {
  return {
    garmentName: value(row, ['Garment', 'Garment Name']),
    categoryName: value(row, ['Category', 'Category Name']),
    serviceName: value(row, ['Service', 'Service Name']),
    rate: value(row, ['Rate', 'Price']),
    unit: value(row, ['Unit']),
    hsn: value(row, ['HSN']),
    gstRate: value(row, ['GST Rate', 'GST']),
    customerPhone: value(row, ['Customer Phone', 'Phone']),
  }
}
async function readSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('The spreadsheet has no worksheet.')
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
}
async function downloadTemplate(mode: ImportMode) {
  const XLSX = await import('xlsx')
  const worksheet = XLSX.utils.aoa_to_sheet(mode === 'customers' ? CUSTOMER_TEMPLATE : PRICE_TEMPLATE)
  worksheet['!cols'] = (mode === 'customers' ? [22, 16, 28, 34] : [22, 18, 22, 12, 14, 12, 12, 20]).map((width) => ({ wch: width }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, mode === 'customers' ? 'Customers' : 'Garment Prices')
  XLSX.writeFile(workbook, mode === 'customers' ? 'laundry-customer-import-template.xlsx' : 'laundry-price-import-template.xlsx', { compression: true })
}
function csvCell(value: unknown) { return '"' + String(value ?? '').replace(/"/g, '""') + '"' }
function downloadRejectedRows(errors: ImportIssue[], mode: ImportMode) {
  const columns = mode === 'customers'
    ? [['Customer Name', 'name'], ['Phone', 'phone'], ['Email', 'email'], ['Address', 'address']]
    : [['Garment', 'garmentName'], ['Category', 'categoryName'], ['Service', 'serviceName'], ['Rate', 'rate'], ['Unit', 'unit'], ['HSN', 'hsn'], ['GST Rate', 'gstRate'], ['Customer Phone', 'customerPhone']]
  const headings = ['Worksheet Row', ...columns.map(([heading]) => heading), 'Import Issue']
  const lines = [
    headings.map(csvCell).join(','),
    ...errors.map((issue) => [
      issue.row,
      ...columns.map(([, column]) => issue.values?.[column]),
      issue.message,
    ].map(csvCell).join(',')),
  ]
  downloadCsv(lines.join('\r\n'), 'laundry-' + mode + '-rows-to-correct.csv')
}
function downloadErrorSummary(errors: Array<{ row: number; message: string }>) {
  const lines = [
    ['Worksheet Row', 'Import Issue'].map(csvCell).join(','),
    ...errors.map((issue) => [issue.row, issue.message].map(csvCell).join(',')),
  ]
  downloadCsv(lines.join('\r\n'), 'laundry-import-error-summary.csv')
}
function downloadCsv(body: string, fileName: string) {
  const link = document.createElement('a')
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }))
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
