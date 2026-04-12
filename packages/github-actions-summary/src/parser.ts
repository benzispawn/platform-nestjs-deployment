import { readFileSync } from 'node:fs';
import { resolve} from 'node:path';
import { CheckResult, CheckStatus, SummaryInput, SummaryStats } from './types.js';

function isValidStatus(value: unknown): value is CheckStatus {
    return value === 'passed' || value === 'failed' || value === 'skipped';
}

function normalizeCheck(raw: unknown): CheckResult {
    if (!raw || typeof raw !== 'object') {
        throw new Error('Each check must be an object');
    }

    const maybeCheck = raw as Record<string, unknown>;

    if (typeof maybeCheck.name !== 'string' || maybeCheck.name.trim().length === 0) {
        throw new Error('Each check must have a non-empty string name');
    }

    if (!isValidStatus(maybeCheck.status)) {
        throw new Error(
        `Invalid status for check "${maybeCheck.name}". Expected passed, failed, or skipped.`,
        );
    }

    return {
        name: maybeCheck.name,
        status: maybeCheck.status,
        details: typeof maybeCheck.details === 'string' ? maybeCheck.details : undefined,
    };
}

export function readSummaryInput(filePath: string): SummaryInput {
    const resolvePath = resolve(filePath);
    const fileContent = readFileSync(resolvePath, 'utf-8');
    const parsed = JSON.parse(fileContent) as Record<string, unknown>;

    if (typeof parsed.title !== 'string' || parsed.title.trim().length === 0) {
        throw new Error('Input JSON must contain a non-empty string field: title');
    }

    if (!Array.isArray(parsed.checks)) {
        throw new Error('Input JSON must contain a checks array.');
    }

    return {
        title: parsed.title,
        checks: parsed.checks.map(normalizeCheck),
    }
}

export function computeStats(input: SummaryInput): SummaryStats {
    const stats = input.checks.reduce(
        (acc, check) => {
            acc.total += 1;
            acc[check.status] += 1;
            return acc;
        },
        {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
        },
    );

    return {
        ...stats,
        overallStatus: stats.failed > 0 ? 'failed' : 'passed',
    }
}