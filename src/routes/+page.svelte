<script lang="ts">
	import {
		hashKey,
		restoreKey,
		addMetadata,
		encryptChunk,
		extractMetadata,
		getChunkTransformer,
		getDecryptTransformer
	} from '$lib/client/crypto';
	import { CHUNK_SIZE } from '$lib/common';
	import toast from 'svelte-5-french-toast';
	import { toHex } from '$lib/client/util';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';

	// STATE
	let files: FileList | undefined = $state(undefined);
	let uploadProgress = $state(0);
	let passphrase: string = $state(page.url.hash.slice(1));

	const uploadFile = () => {
		toast.promise(
			(async () => {
				if (!files || files?.length !== 1) {
					return;
				}
				// Since the filename is lost we encode it at the start of the blob
				const file = files.item(0)!;
				const withMeta = addMetadata(file);
				// Create a key and the hex representation of it and its hash.
				// The hash is used to store and request the file.
				let key = await crypto.subtle.generateKey(
					{ name: 'AES-GCM', length: 256 } satisfies AesKeyGenParams,
					true,
					['encrypt']
				);
				const keyString = toHex(await crypto.subtle.exportKey('raw', key));
				const keyHash = await hashKey(key);
				// AES-GCM 256 has an overhead of 12 IV and 16 tag bytes
				// Chunk accordingly.
				const OVERHEAD = 12 + 16;
				const PLAINTEXT_CHUNK_SIZE = CHUNK_SIZE - OVERHEAD;
				const totalChunks = Math.ceil(withMeta.size / PLAINTEXT_CHUNK_SIZE);
				const totalSize = withMeta.size + totalChunks * OVERHEAD;
				// Upload chunk by chunk while tracking progress
				let bytesWritten = 0;
				for (let i = 0; i < totalChunks; ++i) {
					const start = i * PLAINTEXT_CHUNK_SIZE;
					const end = Math.min(start + PLAINTEXT_CHUNK_SIZE, withMeta.size);
					const chunk = withMeta.slice(start, end);
					const encryptedChunk = await encryptChunk(chunk, key);
					const res = await fetch(`/api/${keyHash}?chunkIdx=${i}&totalSize=${totalSize}`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/octet-stream'
						},
						body: encryptedChunk
					});
					if (res.status !== 201) {
						console.error(res.body);
						uploadProgress = 0;
						throw new Error('Chunk upload failed');
					}
					bytesWritten += end - start;
					uploadProgress = Math.round((bytesWritten / file.size) * 100);
				}
				passphrase = keyString;
				replaceState('', {});
			})(),
			{
				loading: 'Uploading file...',
				success: 'File uploaded!',
				error: 'Error while uploading!'
			}
		);
	};

	const deleteFile = () => {
		toast.promise(
			(async () => {
				if (!passphrase) {
					return;
				}
				const res = await restoreKey(passphrase)
					.then((key) => hashKey(key))
					.then((keyHash) => fetch(`/api/${keyHash}`, { method: 'delete' }));
				if (res.status !== 204) {
					console.error(res.body);
					throw new Error('Deletion request failed');
				}
				passphrase = '';
				replaceState('', {});
			})(),
			{
				loading: 'Deleting file...',
				success: 'File deleted!',
				error: 'Error during deletion!'
			}
		);
	};

	const downloadFile = () => {
		toast.promise(
			(async () => {
				if (!passphrase) {
					return;
				}
				const key = await restoreKey(passphrase);
				const keyHash = await hashKey(key);
				const res = await fetch(`/api/${keyHash}`);
				// Chunk and decrypt the incoming stream
				const reader = res
					.body!.pipeThrough(getChunkTransformer())
					.pipeThrough(getDecryptTransformer(key))
					.getReader();
				// At least one read is guaranteed to be successful
				// Peek to extract filename
				const { value } = await reader.read();
				const extracted = extractMetadata(value!.buffer);
				let blob = new Blob([extracted.file]);
				// Collect remaining chunks
				// NOTE: window.showSaveFilePicker()
				// can imrpove this once supported.
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					blob = new Blob([blob, value]);
				}
				// Download the decrypted result
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = extracted.filename;
				a.click();
				URL.revokeObjectURL(url);
			})().catch((e) => {
				console.error(e);
				throw new Error();
			}),
			{
				loading: 'Downloading file...',
				success: 'Download complete!',
				error: 'Error while downloading!'
			}
		);
	};
</script>

<div class="flex flex-col space-y-6">
	<div class="flex flex-col space-y-4 card p-4 shadow-xl bg-base-200">
		<input
			name="file"
			type="file"
			bind:files
			required={true}
			class="file-input file-input-primary"
		/>
		<progress
			class="progress {uploadProgress === 100 ? 'progress-success' : 'progress-primary'}"
			value={uploadProgress}
			max="100"
		></progress>
		<button
			class="btn btn-primary min-w-[140px]"
			disabled={files?.length === 0 || (uploadProgress !== 0 && uploadProgress !== 100)}
			onclick={uploadFile}
		>
			Upload
		</button>
	</div>
	<div>
		<div class="divider">OR</div>
	</div>
	<div class="flex flex-col space-y-4 card p-4 shadow-xl bg-base-200">
		<label class="input flex items-center gap-2">
			<input
				name="passphrase"
				type="text"
				required={true}
				placeholder="Enter your passphrase..."
				class="input grow shadow-none focus:outline-none"
				bind:value={passphrase}
			/>
			<button
				type="button"
				aria-label="copy passphrase to clipboard"
				class="group w-fit disabled:opacity-50"
				disabled={!passphrase}
				onclick={() => {
					navigator.clipboard.writeText(`${window.location.host}/#${passphrase}`);
					toast.success('Copied Link!');
				}}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-copy group-hover:text-primary group-disabled:group-hover:text-current"
					><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path
						d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
					/></svg
				>
			</button>
		</label>
		<div class="flex space-x-2">
			<button class="btn btn-error grow" disabled={!passphrase} onclick={deleteFile}>Delete</button>
			<button class="btn btn-primary grow" disabled={!passphrase} onclick={downloadFile}>
				Download
			</button>
		</div>
	</div>
</div>
