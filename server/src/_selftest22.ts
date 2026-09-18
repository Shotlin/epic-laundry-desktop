// Epic BOS self-test 22 — Phase-18 HR depth: attendance, leave, expense claims, loans, recruitment.
import { createRow, submitRow, listRows } from './kernel/entity-service.js';
import { store } from './kernel/store.js';
import { recordAttendance, getAttendanceSummary, getLeaveBalances, applyLeave, approveLeave, createExpenseClaim, createEmployeeLoan, getLoanSchedule, createJobOpening, applyToJob, scheduleInterview, getRecruitmentPipeline } from './modules/hr/hr-depth.js';

const T = 'THR';
const MOD = 'hr';
let fails = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function main() {
  // Masters
  const emp = createRow(T, MOD, 'employee', { name: 'John Doe', employee_code: 'EMP-001', department: 'Engineering', is_active: true });
  const lt = createRow(T, MOD, 'leave_type', { name: 'Annual Leave', max_days_per_year: 21, is_carry_forward: true, requires_approval: true });
  const lb = createRow(T, MOD, 'leave_balance', { employee: emp.id, leave_type: lt.id, fiscal_year: '2026', entitled_days: 21, carried_forward: 3 });

  // ---- Attendance ----
  const a1 = recordAttendance(T, MOD, { employee: emp.id, date: '2026-07-01', status: 'Present', in_time: '09:00', out_time: '18:00', working_hours: 8 });
  const a2 = recordAttendance(T, MOD, { employee: emp.id, date: '2026-07-02', status: 'Present', in_time: '09:00', out_time: '18:00', working_hours: 8 });
  const a3 = recordAttendance(T, MOD, { employee: emp.id, date: '2026-07-03', status: 'Absent' });
  const a4 = recordAttendance(T, MOD, { employee: emp.id, date: '2026-07-04', status: 'Half Day', working_hours: 4 });
  const a5 = recordAttendance(T, MOD, { employee: emp.id, date: '2026-07-05', status: 'On Leave' });
  submitRow(T, MOD, 'attendance', a1.id); submitRow(T, MOD, 'attendance', a2.id); submitRow(T, MOD, 'attendance', a3.id); submitRow(T, MOD, 'attendance', a4.id); submitRow(T, MOD, 'attendance', a5.id);

  const sum = getAttendanceSummary(T, emp.id, '2026-07-01', '2026-07-05');
  assert(sum.present === 2, 'Attendance: 2 Present');
  assert(sum.absent === 1, 'Attendance: 1 Absent');
  assert(sum.halfDay === 1, 'Attendance: 1 Half Day');
  assert(sum.onLeave === 1, 'Attendance: 1 On Leave');
  assert(sum.totalHours === 20, 'Attendance: total hours 20');

  // ---- Leave ----
  const la = applyLeave(T, MOD, { employee: emp.id, leave_type: lt.id, from_date: '2026-07-10', to_date: '2026-07-12', total_days: 3, reason: 'Family function' });
  // leave_application created as Draft, approve will submit it
  const balBefore = getLeaveBalances(T, emp.id, '2026');
  const balBeforeAnnual = balBefore.find(b => b.leave_type === lt.id);
  assert(!!balBeforeAnnual && balBeforeAnnual.balance_days === 24, 'Leave balance before approval: 21+3=24');

  approveLeave(T, la.id, emp.id);
  const balAfter = getLeaveBalances(T, emp.id, '2026');
  const balAfterAnnual = balAfter.find(b => b.leave_type === lt.id);
  assert(!!balAfterAnnual && balAfterAnnual.balance_days === 21, 'Leave balance after approval: 24-3=21');

  // ---- Expense Claim ----
  const ec = createExpenseClaim(T, MOD, {
    employee: emp.id,
    posting_date: '2026-07-15',
    items: [
      { date: '2026-07-10', expense_category: 'Travel', description: 'Cab to airport', amount: 850, receipt_attached: true },
      { date: '2026-07-11', expense_category: 'Meals', description: 'Client lunch', amount: 1200, receipt_attached: true },
    ],
  });
  assert(r2(ec.data.total_amount) === 2050, 'Expense claim total = 2050');

  // ---- Employee Loan ----
  const loan = createEmployeeLoan(T, MOD, {
    employee: emp.id,
    loan_type: 'Salary Advance',
    principal_amount: 50000,
    interest_rate: 0,
    tenure_months: 5,
    start_date: '2026-08-01',
    repayment_mode: 'Salary Deduction',
  });
  assert(loan.data.emi_amount === 10000, 'Loan EMI = 10000 (50000/5, 0% interest)');
  const sch = getLoanSchedule(T, loan.id);
  assert(sch.length === 5, 'Loan schedule has 5 months');
  assert(sch[0].balance === 40000, 'First month balance 40000');
  assert(sch[4].balance === 0, 'Final month balance 0');

  // ---- Recruitment ----
  const jo = createJobOpening(T, MOD, {
    title: 'Senior Engineer',
    department: 'Engineering',
    designation: 'Senior Software Engineer',
    employment_type: 'Full-time',
    min_experience: 4,
    salary_min: 1200000,
    salary_max: 1800000,
    status: 'Open',
  });
  const app = applyToJob(T, MOD, {
    job_opening: jo.id,
    applicant_name: 'Jane Smith',
    email: 'jane@example.com',
    experience_years: 5,
    current_ctc: 1400000,
    expected_ctc: 1600000,
  });
  assert(app.data.status === 'Applied', 'Application status = Applied');

  const iv = scheduleInterview(T, MOD, {
    job_applicant: app.id,
    round: 'Technical 1',
    interviewer: emp.id,
    scheduled_on: '2026-07-20',
    duration_minutes: 60,
  });
  assert(iv.data.status === 'Scheduled', 'Interview scheduled');

  const pipe = getRecruitmentPipeline(T);
  const appliedStage = pipe.find(p => p.stage === 'Applied');
  assert(!!appliedStage && appliedStage.count === 1, 'Pipeline shows 1 Applied');

  console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}
main();