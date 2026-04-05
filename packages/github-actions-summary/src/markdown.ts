import { SummaryInput, SummaryStats } from "./types.js";

function statusIcon(status: string): string {
  switch (status) {
    case 'passed':
      return '✅';
    case 'failed':
      return '❌';
    case 'skipped':
      return '⏭️';
    default:
      return '•';
  }
}

export function renderSummaryMarkdown(input: SummaryInput, stats: SummaryStats, title?: string): string {
    const heading = title && title.trim().length > 0 ? title: input.title;

    const checkLines = input.checks
        .map((check) => {
            const details = check.details ? ` - ${check.details}` : '';
            return `- ${statusIcon(check.status)} **${check.name}**: ${check.status}${details}`;
        })
        .join('\n');

    return [
        `## ${heading}`,
        '',
        `- **Overall Status**: ${stats.overallStatus}`,
        `- **Total**: ${stats.total}`,
        `- **Passed**: ${stats.passed}`,
        `- **Failed**: ${stats.failed}`,
        `- **Skipped**: ${stats.skipped}`,
        '',
        '### Checks',
        checkLines,
        '',
    ].join('\n');
}