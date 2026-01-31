// ============================================================================
// WiFiShare - Composant FileDropZone
// Zone de dépôt de fichiers avec validation
// ============================================================================

import { memo, useState, useCallback, useRef } from 'react';
import { Upload, File, X, AlertCircle } from 'lucide-react';
import { fileTransferService } from '../services/fileTransferService';
import { FILE_VALIDATION_CONFIG } from '../config';

interface FileDropZoneProps {
    onFilesSelected: (files: File[]) => void;
    maxFiles?: number;
    className?: string;
}

export const FileDropZone = memo(function FileDropZone({
    onFilesSelected,
    maxFiles = 10,
    className = ''
}: FileDropZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [errors, setErrors] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const validateAndAddFiles = useCallback((files: FileList | null) => {
        if (!files) return;

        const newFiles: File[] = [];
        const newErrors: string[] = [];

        const filesArray = Array.from(files);
        const remainingSlots = maxFiles - selectedFiles.length;

        if (filesArray.length > remainingSlots) {
            newErrors.push(`Maximum ${maxFiles} fichiers autorisés`);
        }

        for (const file of filesArray.slice(0, remainingSlots)) {
            const validation = fileTransferService.validateFile(file);
            if (validation.success) {
                newFiles.push(file);
            } else {
                newErrors.push(`${file.name}: ${validation.error.message}`);
            }
        }

        if (newFiles.length > 0) {
            const updatedFiles = [...selectedFiles, ...newFiles];
            setSelectedFiles(updatedFiles);
            onFilesSelected(updatedFiles);
        }

        setErrors(newErrors);
    }, [selectedFiles, maxFiles, onFilesSelected]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        validateAndAddFiles(e.dataTransfer.files);
    }, [validateAndAddFiles]);

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        validateAndAddFiles(e.target.files);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeFile = (index: number) => {
        const updatedFiles = selectedFiles.filter((_, i) => i !== index);
        setSelectedFiles(updatedFiles);
        onFilesSelected(updatedFiles);
    };

    const formatSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    };

    const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Drop Zone */}
            <div
                onClick={handleClick}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
          relative border-2 border-dashed rounded-2xl p-8
          flex flex-col items-center justify-center gap-4
          cursor-pointer transition-all duration-300
          ${isDragging
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/30'
                    }
        `}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                />

                <div className={`
          w-16 h-16 rounded-full flex items-center justify-center
          transition-all duration-300
          ${isDragging ? 'bg-primary-500/20' : 'bg-slate-700'}
        `}>
                    <Upload className={`
            w-8 h-8 transition-colors duration-300
            ${isDragging ? 'text-primary-400' : 'text-slate-400'}
          `} />
                </div>

                <div className="text-center">
                    <p className="text-white font-medium">
                        {isDragging ? 'Déposez les fichiers ici' : 'Glissez des fichiers ici'}
                    </p>
                    <p className="text-sm text-slate-400 mt-1">
                        ou cliquez pour sélectionner
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                        Max {formatSize(FILE_VALIDATION_CONFIG.maxSizeBytes)} par fichier
                    </p>
                </div>
            </div>

            {/* Errors */}
            {errors.length > 0 && (
                <div className="space-y-2">
                    {errors.map((error, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Selected Files */}
            {selectedFiles.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-400">
                        <span>{selectedFiles.length} fichier(s) sélectionné(s)</span>
                        <span>{formatSize(totalSize)}</span>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {selectedFiles.map((file, index) => (
                            <div
                                key={`${file.name}-${index}`}
                                className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl"
                            >
                                <File className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white truncate">{file.name}</p>
                                    <p className="text-xs text-slate-500">{formatSize(file.size)}</p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeFile(index);
                                    }}
                                    className="p-1 rounded-lg hover:bg-slate-700 transition-colors"
                                >
                                    <X className="w-4 h-4 text-slate-400" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});
