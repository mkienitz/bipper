import { CHUNK_SIZE } from '$lib/common';
import type { StateUpdate } from '$lib/server/schemas';
import { getMaxFileSize, getStorageDir } from '$lib/server/utils';
import { error } from '@sveltejs/kit';
import fs, { type FileHandle } from 'node:fs/promises';
import path from 'node:path';

type FileUpload = {
	keyHash: string;
	totalSize: number;
	chunksWritten: number;
	fileHandle: FileHandle;
	timeout: NodeJS.Timeout | undefined;
};

export class StateHandler {
	uploadStates: Map<string, FileUpload>;

	constructor() {
		this.uploadStates = new Map();
	}

	private validateUploadInfo({ chunkIdx, totalSize, keyHash, chunk }: StateUpdate): boolean {
		// OR
		// Hash must exist and only chunkIdx must be present
		if (!this.uploadStates.has(keyHash)) {
			// New hash
			// => totalSize must be provided
			// => chunkIdx must be zero
			// => chunkSize must not exceed totalSize
			return (
				totalSize !== null &&
				totalSize <= getMaxFileSize() &&
				chunkIdx === 0 &&
				chunk.byteLength <= totalSize
			);
		} else {
			// Existing hash
			// => totalSize must not be provided
			// => chunkIdx === chunksWritten + 1
			// => chunkIdx < totalChunks
			// => chunkSize + currSize must not exceed totalSize
			// => If it's not the last chunk chunkSize must be CHUNK_SIZE
			let currStatus = this.uploadStates.get(keyHash);
			const totalChunks = Math.ceil(currStatus!.totalSize / CHUNK_SIZE);
			return (
				totalSize === null &&
				chunkIdx === currStatus!.chunksWritten &&
				chunkIdx <= totalChunks &&
				currStatus!.chunksWritten * CHUNK_SIZE + chunk.byteLength <= currStatus!.totalSize! &&
				(!(chunkIdx !== totalChunks - 1) || chunk.byteLength === CHUNK_SIZE)
			);
		}
	}

	async handleUpdate(stateUpdate: StateUpdate) {
		if (!this.validateUploadInfo(stateUpdate)) {
			error(422);
		}

		const { keyHash, totalSize, chunk } = stateUpdate;
		// Handle new transaction by setting up initial state and fileHandle
		const filePath = path.join(getStorageDir(), keyHash);
		if (!this.uploadStates.has(keyHash)) {
			console.info('Starting new transaction...');
			// If open fails, no cleanup is required
			const fileHandle = await fs.open(filePath, 'a');
			console.info(`Writing to ${filePath}...`);
			this.uploadStates.set(keyHash, {
				keyHash,
				totalSize: totalSize!,
				chunksWritten: 0,
				fileHandle,
				timeout: undefined
			} satisfies FileUpload);
		}

		// After establishing state, write chunk to disk
		const currStatus = this.uploadStates.get(keyHash)!;

		if (currStatus.timeout) {
			clearTimeout(currStatus.timeout);
		}
		currStatus.timeout = this.createCleanupTimeout(keyHash);

		try {
			currStatus.fileHandle.write(new Uint8Array(chunk), 0, chunk.byteLength);
		} catch (e) {
			console.error(e);
			this.abnormalCleanup(keyHash);
			error(500);
		}
		currStatus.chunksWritten += 1;
		// Handle finished transaction
		if (currStatus.chunksWritten === Math.ceil(currStatus.totalSize / CHUNK_SIZE)) {
			this.cleanup(keyHash);
			console.info('Transaction finished!');
		}
	}

	createCleanupTimeout(keyHash: string): NodeJS.Timeout {
		return setTimeout(async () => {
			console.info(`Upload for ${keyHash} has not been continued. Cleaning up...`);
			await this.abnormalCleanup(keyHash);
		}, 30000);
	}

	private async cleanup(keyHash: string) {
		const state = this.uploadStates.get(keyHash);
		if (!state) {
			return;
		}
		clearTimeout(state.timeout);
		await state.fileHandle.close();
		this.uploadStates.delete(keyHash);
	}

	private async abnormalCleanup(keyHash: string) {
		const filePath = path.join(getStorageDir(), keyHash);
		await fs.rm(filePath, { force: true });
		await this.cleanup(keyHash);
	}
}
