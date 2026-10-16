import type { Expense, Group, Profile, Settlement } from '@/data/types';

import { netBalances } from './balances';
import { simplifyDebts } from './debts';
import { formatCents } from './money';
import type { SplitMethod } from './splits';

const STATUS = {
  active: 'active (adding expenses)',
  settling: 'settling up (expenses locked)',
  settled: 'settled (everyone paid back)',
} as const;

const SPLIT_LABEL: Record<SplitMethod, string> = {
  equal: 'split equally',
  exact: 'split by exact amounts',
  percent: 'split by percentage',
  shares: 'split by shares',
};

const day = (iso: string) => iso.slice(0, 10);
const byDate = <T extends { created_at: string }>(rows: T[]) =>
  [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));

/**
 * The whole group as plain text: rules, expenses, payments, balances and suggested repayments,
 * so people can paste it into ChatGPT (or any AI) and have the math checked independently.
 */
export function groupSummaryText({
  group,
  members,
  expenses,
  settlements,
  myId,
}: {
  group: Pick<Group, 'name' | 'status'>;
  members: Profile[];
  expenses: Expense[];
  settlements: Settlement[];
  myId: string | null;
}): string {
  const name = (id: string) => members.find((m) => m.id === id)?.display_name || 'Unknown';
  const memberOrder = (id: string) => {
    const index = members.findIndex((m) => m.id === id);
    return index < 0 ? members.length : index;
  };
  const balances = netBalances(expenses, settlements);
  const repayments = simplifyDebts(balances);
  const total = expenses.reduce((sum, e) => sum + e.amount_cents, 0);
  const memberNames = members.map((m) => (m.id === myId ? `${name(m.id)} (me)` : name(m.id)));

  const lines = [
    `SplitEasy group: ${group.name}`,
    `Status: ${STATUS[group.status]}`,
    'Currency: US dollars',
    `Members (${members.length}): ${memberNames.join(', ')}`,
    '',
    'How SplitEasy calculates:',
    '- Each expense is split equally, by exact amounts, by percentage or by shares, as noted on it. Each person\'s exact share in dollars is listed; when an amount doesn\'t divide evenly, the extra cents go to whoever was closest to the next cent.',
    '- Balance = amount paid for expenses - own shares + payments sent - payments received. Positive means they get money back; negative means they owe.',
    '- Suggested repayments are the fewest payments that bring everyone to $0.00.',
    '',
    `Expenses (${expenses.length}, total ${formatCents(total)}):`,
    ...(expenses.length === 0 ? ['None'] : []),
    ...byDate(expenses).map((e, i) => {
      const split = [...e.splits]
        .sort((a, b) => memberOrder(a.user_id) - memberOrder(b.user_id))
        .map((s) => {
          const v = s.split_value;
          const typed = v == null ? '' : e.split_method === 'percent' ? ` (${v}%)` : ` (${v} share${v === 1 ? '' : 's'})`;
          return `${name(s.user_id)} ${formatCents(s.amount_cents)}${typed}`;
        })
        .join(', ');
      const how = SPLIT_LABEL[e.split_method] ?? SPLIT_LABEL.equal;
      return `${i + 1}. ${day(e.created_at)} | ${e.description} | ${formatCents(e.amount_cents)} paid by ${name(e.paid_by)} | ${how}: ${split}`;
    }),
    '',
    `Payments already made (${settlements.length}):`,
    ...(settlements.length === 0 ? ['None'] : []),
    ...byDate(settlements).map(
      (s, i) => `${i + 1}. ${day(s.created_at)} | ${name(s.from_user)} paid ${name(s.to_user)} ${formatCents(s.amount_cents)}`,
    ),
    '',
    'Balances:',
    ...members.map((m) => {
      const cents = balances.get(m.id) ?? 0;
      const state = cents > 0 ? `gets back ${formatCents(cents)}` : cents < 0 ? `owes ${formatCents(-cents)}` : 'settled up ($0.00)';
      return `- ${name(m.id)}: ${state}`;
    }),
    '',
    'Suggested repayments:',
    ...(repayments.length === 0 ? ['None, everyone is settled up.'] : []),
    ...repayments.map((p, i) => `${i + 1}. ${name(p.from)} pays ${name(p.to)} ${formatCents(p.amountCents)}`),
    '',
    'Please check: does every balance follow from the expenses and payments above, do the balances add up to $0.00, and do the suggested repayments settle everyone?',
  ];
  return lines.join('\n');
}
