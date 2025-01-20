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

	// STATE
	let files: FileList | undefined = $state(undefined);
	let uploadProgress = $state(0);
	let passphrase: string | undefined = $state(undefined);

	const uploadFile = () => {
		toast.promise(
			(async () => {
				if (!files || files?.length !== 1) {
					return;
				}
				const file = files.item(0)!;
				const withMeta = addMetadata(file);

				let key = await crypto.subtle.generateKey(
					{ name: 'AES-GCM', length: 256 } satisfies AesKeyGenParams,
					true,
					['encrypt']
				);

				// Get hex representation of the key and its hash
				const keyString = toHex(await crypto.subtle.exportKey('raw', key));
				const keyHash = await hashKey(key);

				const OVERHEAD = 12 + 16;
				const PLAINTEXT_CHUNK_SIZE = CHUNK_SIZE - OVERHEAD;
				const totalChunks = Math.ceil(withMeta.size / PLAINTEXT_CHUNK_SIZE);
				const totalSize = withMeta.size + totalChunks * OVERHEAD;

				let bytesWritten = 0;
				for (let i = 0; i < totalChunks; ++i) {
					const start = i * PLAINTEXT_CHUNK_SIZE;
					const end = Math.min(start + PLAINTEXT_CHUNK_SIZE, withMeta.size);

					const chunk = withMeta.slice(start, end);
					const encryptedChunk = await encryptChunk(chunk, key);

					const res = await fetch(`/${keyHash}?chunkIdx=${i}&totalSize=${totalSize}`, {
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
					.then((keyHash) => fetch(`/${keyHash}`, { method: 'delete' }));
				if (res.status !== 204) {
					console.error(res.body);
					throw new Error('Deletion request failed');
				}
				passphrase = undefined;
			})(),
			{
				loading: 'Deleting file...',
				success: 'File deleted!',
				error: 'Error while deletion!'
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
				const res = await fetch(`/${keyHash}`);
				// Create decrypted blob and extract metadata
				const stream = res
					.body!.pipeThrough(getChunkTransformer())
					.pipeThrough(getDecryptTransformer(key));
				const decryptedBlob = await new Response(stream).arrayBuffer();
				const { file, filename } = extractMetadata(decryptedBlob);

				// Download the decrypted result
				const url = URL.createObjectURL(file);
				const a = document.createElement('a');
				a.href = url;
				a.download = filename;
				a.click();
				URL.revokeObjectURL(url);
			})(),
			{
				loading: 'Downloading file...',
				success: 'Download complete!',
				error: 'Error while downloading!'
			}
		);
	};
</script>

<div class="flex flex-col space-y-4">
	<input
		name="file"
		type="file"
		bind:files
		required={true}
		class="file-input file-input-bordered"
	/>
	<progress
		class="progress {uploadProgress === 100 ? 'progress-success' : 'progress-primary'}"
		value={uploadProgress}
		max="100"
	></progress>
	<button
		class="btn btn-primary min-w-[140px]"
		disabled={!files || (uploadProgress !== 0 && uploadProgress !== 100)}
		onclick={uploadFile}
	>
		Upload
	</button>
	<label class="input input-bordered flex items-center gap-2">
		<input
			name="passphrase"
			type="text"
			required={true}
			placeholder="Enter your passphrase..."
			class="input grow border-0"
			bind:value={passphrase}
		/>
		<button
			type="button"
			aria-label="copy passphrase to clipboard"
			class="group w-fit"
			disabled={!passphrase}
			onclick={() => {
				if (!passphrase) {
					return;
				}
				navigator.clipboard.writeText(passphrase);
				toast.success('Copied');
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
