import { parentPort, workerData } from 'node:worker_threads';
import { exporter } from './ConversationExporter';
import fs from 'fs';
import os from 'os';
import path from 'path';

interface ActiveTasks {
	nodeId: string;
	sessionId: string;
	workdir: string;
	disabled: boolean;
}

type WorkerCommand =
	| { type: 'add'; nodeId: string; sessionId: string; workdir: string }
	| { type: 'remove'; nodeId: string; sessionId: string }

interface WorkerBootstrapData {
	workdir?: string;
	cleanOldFiles?: boolean;
}

const CHECK_INTERVAL_MS = 5000;
const tasks: Map<string, ActiveTasks> = new Map();
let timer: NodeJS.Timeout | null = null;

function startTimer(): void {
	if (timer) {
		return;
	}

	timer = setInterval(() => {
		// Export Claude Code execution details
		for (const task of [...tasks.values()]) {
			const { nodeId, sessionId, workdir } = task;
			const separator = '-';
			const normalizedWorkdir = workdir.replaceAll('/', separator).replaceAll('_', separator).replaceAll(' ', separator).replaceAll('.', separator);
			const jsonlPath = path.join(os.homedir(), '.claude', 'projects', normalizedWorkdir, `${sessionId}.jsonl`);
			const outputPath = `${workdir}/claude_code_${sessionId}_${nodeId}.html`;

			try {
				// Skip export when the jsonl file does not exist
				if (!fs.existsSync(jsonlPath)) {
					continue;
				}
				const exportResult = exporter.exportConversation(jsonlPath, outputPath, false);
				if (!exportResult.success) {
					console.warn(`Failed to export conversation for session ${sessionId}, node ${nodeId}`);
				}
				if (task.disabled) {
					tasks.delete(`${sessionId}-${nodeId}`);
				}
			} catch (error: unknown) {
				console.error(`Error exporting conversation for session ${sessionId}, node ${nodeId}:`, error);
			}
		}
	}, CHECK_INTERVAL_MS);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function parseCommand(raw: unknown): WorkerCommand | null {
	if (!isObject(raw) || typeof raw.type !== 'string') {
		return null;
	}

	return raw as WorkerCommand;
}

function parseWorkerBootstrapData(raw: unknown): WorkerBootstrapData {
	if (!isObject(raw)) {
		return {};
	}

	return typeof raw.workdir === 'string' ? { workdir: raw.workdir } : {};
}

function handleCommand(command: WorkerCommand): void {
	switch (command.type) {
		case 'add': {
			tasks.set(`${command.sessionId}-${command.nodeId}`, {
				nodeId: command.nodeId,
				sessionId: command.sessionId,
				workdir: command.workdir,
				disabled: false,
			});
			return;
		}

		case 'remove': {
			const key = `${command.sessionId}-${command.nodeId}`;
			if (tasks.has(key)) {
				const task = tasks.get(key);
				if (task) {
					task.disabled = true;
				}
			}
			return;
		}
	}
}

if (!parentPort) {
	throw new Error('ClaudeExporterWorker must run in a worker thread');
}

// Remove all claude_code_*.html files from workDir to avoid stale, misleading output
const bootstrapData = parseWorkerBootstrapData(workerData);
const workDir = bootstrapData.workdir || process.env.WORKDIR || null;
const cleanOldFiles = bootstrapData.cleanOldFiles || process.env.CLEAN_OLD_FILES === 'true' || false;
if (workDir && cleanOldFiles) {
	const files = fs.readdirSync(workDir);
	for (const file of files) {
		if (file.startsWith('claude_code_') && file.endsWith('.html')) {
			fs.unlinkSync(path.join(workDir, file));
		}
	}
}

startTimer();

parentPort.on('message', (raw: unknown) => {
	const command = parseCommand(raw);
	if (!command) {
		return;
	}

	try {
		handleCommand(command);
	} catch (error: unknown) {
		console.error('Error handling command in ClaudeExporterWorker:', error);
	}
});