// P18 HR Depth: Attendance, Leave, Expense Claims, Employee Loans, Recruitment.
// All functions are pure TypeScript using the metadata-driven kernel.
import { store } from '../../kernel/store.js';
import { createRow, submitRow } from '../../kernel/entity-service.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// --- Attendance ---
export interface AttendanceRecord {
  employee: string;
  date: string;
  status: 'Present' | 'Absent' | 'Half Day' | 'On Leave' | 'Holiday';
  shift?: string;
  in_time?: string;
  out_time?: string;
  working_hours?: number;
  status_note?: string;
}

export function recordAttendance(tenant: string, mod: string, rec: AttendanceRecord) {
  const row = createRow(tenant, mod, 'attendance', rec);
  return row;
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  halfDay: number;
  onLeave: number;
  holiday: number;
  totalHours: number;
}

export function getAttendanceSummary(tenant: string, employee: string, fromDate: string, toDate: string): AttendanceSummary {
  const recs = store.rowsOf(tenant, 'attendance')
    .filter(r => r.data.employee === employee && r.data.date >= fromDate && r.data.date <= toDate && r.status === 'Submitted');
  const summary: AttendanceSummary = { present: 0, absent: 0, halfDay: 0, onLeave: 0, holiday: 0, totalHours: 0 };
  for (const r of recs) {
    switch (r.data.status) {
      case 'Present': summary.present++; break;
      case 'Absent': summary.absent++; break;
      case 'Half Day': summary.halfDay++; break;
      case 'On Leave': summary.onLeave++; break;
      case 'Holiday': summary.holiday++; break;
    }
    summary.totalHours += Number(r.data.working_hours || 0);
  }
  summary.totalHours = r2(summary.totalHours);
  return summary;
}

// --- Leave Management ---
export interface LeaveBalanceSummary {
  leave_type: string;
  leave_type_name: string;
  leaveTypeId: string;
  entitled: number;
  carried_forward: number;
  availed: number;
  balance: number;
  balance_days: number;
}

export function getLeaveBalances(tenant: string, employee: string, fiscalYear: string): LeaveBalanceSummary[] {
  const balances = store.rowsOf(tenant, 'leave_balance')
    .filter(b => b.data.employee === employee && b.data.fiscal_year === fiscalYear);
  return balances.map(b => {
    const entitled = Number(b.data.entitled_days || 0);
    const carried = Number(b.data.carried_forward || 0);
    const availed = Number(b.data.availed_days || 0);
    const balance = entitled + carried - availed;
    return {
      leave_type: b.data.leave_type,
      leave_type_name: store.getRow(tenant, b.data.leave_type)?.data?.name || '',
      leaveTypeId: b.data.leave_type,
      entitled,
      carried_forward: carried,
      availed,
      balance,
      balance_days: balance,
    };
  });
}

export function applyLeave(tenant: string, mod: string, data: {
  employee: string; leave_type: string; from_date: string; to_date: string;
  total_days: number; reason: string;
}) {
  const row = createRow(tenant, mod, 'leave_application', {
    ...data,
    status: 'Submitted',
  });
  return row;
}

export function approveLeave(tenant: string, leaveAppId: string, approver: string) {
  const row = store.getRow(tenant, leaveAppId);
  if (!row) throw new Error('Leave application not found');
  row.data.status = 'Approved';
  row.data.approver = approver;
  row.data.approved_on = new Date().toISOString().slice(0, 10);
  submitRow(tenant, 'hr', 'leave_application', leaveAppId);

  // Deduct from leave balance
  const leaveType = row.data.leave_type;
  const fy = row.data.from_date.slice(0, 4); // Use year part as fiscal year (e.g., '2026')
  const balance = store.rowsOf(tenant, 'leave_balance')
    .find(b => b.data.employee === row.data.employee && b.data.leave_type === leaveType && b.data.fiscal_year === fy);
  if (balance) {
    balance.data.availed_days = Number(balance.data.availed_days || 0) + Number(row.data.total_days || 0);
    balance.data.balance_days = (Number(balance.data.entitled_days || 0) + Number(balance.data.carried_forward || 0)) - Number(balance.data.availed_days || 0);
  }
}

// --- Expense Claims ---
export interface ExpenseClaimItem {
  expense_category: string;
  category?: string;
  amount: number;
  date: string;
  description?: string;
  currency?: string;
  receipt_attached?: boolean;
}

export function createExpenseClaim(tenant: string, mod: string, data: {
  employee: string; posting_date: string; items: ExpenseClaimItem[];
}) {
  const total = data.items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  const row = createRow(tenant, mod, 'expense_claim', {
    ...data,
    total_amount: r2(total),
    status: 'Submitted',
  });
  return row;
}

// --- Employee Loans ---
function calculateEMI(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 12 / 100;
  if (r === 0) return r2(principal / months);
  return r2((principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
}

export function createEmployeeLoan(tenant: string, mod: string, data: {
  employee: string; loan_type: string; principal_amount: number;
  interest_rate?: number; repayment_mode?: string; installment_amount?: number;
  start_date: string; end_date?: string; total_installments?: number;
  tenure_months?: number;
}) {
  const months = data.total_installments || data.tenure_months || 1;
  const emi = data.installment_amount || calculateEMI(data.principal_amount, data.interest_rate || 0, months);
  const row = createRow(tenant, mod, 'employee_loan', {
    ...data,
    total_installments: months,
    emi_amount: emi,
    paid_installments: 0,
    balance_amount: data.principal_amount,
    status: 'Active',
  });
  return row;
}

export function getLoanSchedule(tenant: string, loanId: string) {
  const loan = store.getRow(tenant, loanId);
  if (!loan) return [];
  const p = Number(loan.data.principal_amount);
  const r = (Number(loan.data.interest_rate) || 0) / 12 / 100;
  const n = Number(loan.data.total_installments || 0);
  const emi = Number(loan.data.emi_amount || loan.data.installment_amount || 0);
  const schedule = [];
  let balance = p;
  for (let i = 1; i <= n; i++) {
    const interest = r2(balance * r);
    const principalPaid = r2(emi - interest);
    balance = r2(balance - principalPaid);
    schedule.push({ month: i, emi, principal: principalPaid, interest, balance: balance < 0.01 ? 0 : balance });
  }
  return schedule;
}

// --- Recruitment ---
export function createJobOpening(tenant: string, mod: string, data: {
  title: string; department?: string; designation?: string;
  description?: string; requirements?: string;
  min_experience?: number; max_experience?: number;
  salary_min?: number; salary_max?: number;
  employment_type?: string;
  status?: string;
}) {
  const row = createRow(tenant, mod, 'job_opening', {
    ...data,
    status: data.status || 'Draft',
    opened_on: new Date().toISOString().slice(0, 10),
  });
  return row;
}

export function applyToJob(tenant: string, mod: string, data: {
  job_opening: string; applicant_name: string; email?: string; phone?: string;
  resume?: string; experience_years?: number; current_ctc?: number; expected_ctc?: number;
}) {
  const row = createRow(tenant, mod, 'job_applicant', {
    ...data,
    status: 'Applied',
    applied_on: new Date().toISOString().slice(0, 10),
  });
  return row;
}

export function scheduleInterview(tenant: string, mod: string, data: {
  job_applicant: string; round: string; interviewer: string;
  scheduled_on: string; duration_minutes?: number;
}) {
  const row = createRow(tenant, mod, 'interview', {
    ...data,
    status: 'Scheduled',
  });
  return row;
}

export function getRecruitmentPipeline(tenant: string) {
  const applicants = store.rowsOf(tenant, 'job_applicant');
  const stages = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected', 'Withdrawn'];
  return stages.map(s => ({ stage: s, count: applicants.filter(a => a.data.status === s).length }));
}