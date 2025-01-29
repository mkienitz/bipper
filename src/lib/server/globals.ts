export let STORE_DIR: string;
export let MAX_FILE_SIZE: number;

export const setStoreDir = (storeDir: string) => {
	STORE_DIR = storeDir;
};

export const setMaxFileSize = (maxFileSize: number) => {
	MAX_FILE_SIZE = maxFileSize;
};
