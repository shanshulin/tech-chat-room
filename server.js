// ... (所有 require 和配置保持不变)
const express = require('express');
const http = require('http');
// ...

async function main() {
    // ... (数据库初始化部分不变)

    // ... (静态文件服务部分不变)

    // ★★★ 加强日志的图片上传路由 ★★★
    app.post('/upload', upload.single('image'), async (req, res) => {
        console.log('--- /upload 路由被访问 ---'); // 1. 确认路由被触发
        if (!req.file) {
            console.log('上传失败：没有文件被上传。');
            return res.status(400).send('No file uploaded.');
        }

        console.log(`收到文件: ${req.file.originalname}, 大小: ${req.file.size} bytes`); // 2. 确认文件被接收

        try {
            // 使用 Promise 包装 cloudinary 的流式上传，以便使用 async/await
            const uploadToCloudinary = (fileBuffer) => {
                return new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
                        if (error || !result) {
                            return reject(error || new Error('Cloudinary result is empty.'));
                        }
                        resolve(result);
                    });
                    stream.end(fileBuffer);
                });
            };

            console.log('正在尝试上传到 Cloudinary...'); // 3. 确认开始上传
            const result = await uploadToCloudinary(req.file.buffer);
            
            console.log('Cloudinary 上传成功！URL:', result.secure_url); // 4. 确认上传成功
            res.json({ imageUrl: result.secure_url });

        } catch (error) {
            console.error('致命错误：Cloudinary 上传过程中发生异常:', error); // 5. 捕获并打印任何可能的异常
            res.status(500).send({ message: 'Upload to Cloudinary failed.', error: error.message });
        }
    });


    // ... (Socket.IO 连接逻辑不变)
    
    // ... (启动服务器逻辑不变)
}

main();