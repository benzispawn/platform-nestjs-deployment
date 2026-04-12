export type CheckStatus = 'passed' | 'failed' | 'skipped';

export interface CheckResult {
    name: string;
    status: CheckStatus;
    details?: string;
}

export interface SummaryInput {
    title: string;
    checks: CheckResult[];
}

export interface SummaryStats {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    overallStatus: CheckStatus;
}