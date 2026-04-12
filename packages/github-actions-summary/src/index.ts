import * as core from '@actions/core';
import { computeStats, readSummaryInput } from './parser.js';
import { renderSummaryMarkdown } from './markdown.js';

async function run(): Promise<void> {
    try {
        const inputFile = core.getInput('input-file', { required: true });
        const summaryTitle = core.getInput('summary-title');

        const input = readSummaryInput(inputFile);
        const stats = computeStats(input);
        const markdown = renderSummaryMarkdown(input, stats, summaryTitle);

        await core.summary.addRaw(markdown, true).write();

        core.setOutput('total', String(stats.total));
        core.setOutput('passed', String(stats.passed));
        core.setOutput('failed', String(stats.failed));
        core.setOutput('skipped', String(stats.skipped));
        core.setOutput('overall-status', stats.overallStatus);

        core.info(`Summary generated successfully for ${input.title}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error while running action';
        core.setFailed(message);
    }
}

void run();