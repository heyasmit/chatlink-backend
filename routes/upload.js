const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const name = path.basename(file.originalname, extension);
    cb(null, `${name}-${uniqueSuffix}${extension}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedTypes = /jpeg|jpg|png|gif|pdf|docx|doc|txt|mp4|avi|mov|mp3|wav/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Single file upload
router.post('/file', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please select a file to upload'
      });
    }

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    res.json({
      message: 'File uploaded successfully',
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        url: fileUrl,
        size: formatFileSize(req.file.size),
        type: req.file.mimetype,
        uploadedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: 'Failed to upload file'
    });
  }
});

// Multiple files upload
router.post('/files', authMiddleware, upload.array('files', 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded',
        message: 'Please select files to upload'
      });
    }

    const files = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      url: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`,
      size: formatFileSize(file.size),
      type: file.mimetype,
      uploadedAt: new Date().toISOString()
    }));

    res.json({
      message: 'Files uploaded successfully',
      files
    });

  } catch (error) {
    console.error('Files upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: 'Failed to upload files'
    });
  }
});

// Delete file
router.delete('/file/:filename', authMiddleware, (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found',
        message: 'The requested file does not exist'
      });
    }

    // Delete file
    fs.unlinkSync(filePath);

    res.json({
      message: 'File deleted successfully',
      filename
    });

  } catch (error) {
    console.error('File delete error:', error);
    res.status(500).json({
      error: 'Delete failed',
      message: 'Failed to delete file'
    });
  }
});

// Get file info
router.get('/file/:filename/info', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found',
        message: 'The requested file does not exist'
      });
    }

    const stats = fs.statSync(filePath);
    const fileExtension = path.extname(filename).toLowerCase();
    
    res.json({
      filename,
      size: formatFileSize(stats.size),
      type: getFileType(fileExtension),
      created: stats.birthtime,
      modified: stats.mtime,
      url: `${req.protocol}://${req.get('host')}/uploads/${filename}`
    });

  } catch (error) {
    console.error('File info error:', error);
    res.status(500).json({
      error: 'Failed to get file info',
      message: 'Internal server error'
    });
  }
});

// Helper functions
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileType(extension) {
  const imageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
  const videoTypes = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'];
  const audioTypes = ['.mp3', '.wav', '.aac', '.ogg', '.wma'];
  const documentTypes = ['.pdf', '.doc', '.docx', '.txt', '.rtf'];

  if (imageTypes.includes(extension)) return 'image';
  if (videoTypes.includes(extension)) return 'video';
  if (audioTypes.includes(extension)) return 'audio';
  if (documentTypes.includes(extension)) return 'document';
  
  return 'file';
}

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'File size must be less than 10MB'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files',
        message: 'Maximum 5 files allowed'
      });
    }
  }
  
  if (error.message === 'File type not allowed') {
    return res.status(400).json({
      error: 'Invalid file type',
      message: 'Only images, documents, videos, and audio files are allowed'
    });
  }

  next(error);
});

module.exports = router;