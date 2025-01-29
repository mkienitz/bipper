export const toHex = (arrayBuffer: ArrayBufferLike) => {
	return Array.from(new Uint8Array(arrayBuffer), (b) => b.toString(16).padStart(2, '0')).join('');
};

export const fromHex = (hexString: string): Uint8Array => {
	const res = new Uint8Array(Math.ceil(hexString.length / 2));
	for (let i = 0; i < hexString.length; )
		res[i / 2] = Number.parseInt(hexString.slice(i, (i += 2)), 16);
	return res;
};
