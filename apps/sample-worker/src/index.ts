export function processJob(jobName: string): string {
  return `processed:${jobName}`;
}

console.log(processJob('example-job'));
