import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    platform: process.platform,
    version: process.versions.electron,
    selectBackupFolder: () => ipcRenderer.invoke('select-backup-folder'),
    updateAppIcon: (pngBuffer: ArrayBuffer) => ipcRenderer.invoke('update-app-icon', pngBuffer),
});
