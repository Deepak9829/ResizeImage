const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

const s3Client = new S3Client({});

exports.handler = async (event) => {
    try {
        // Parse the incoming request
        const body = JSON.parse(event.body);
        const imageData = Buffer.from(body.image, 'base64');
        const fileName = body.fileName || `image-${Date.now()}.jpg`;

        // Upload original image
        await s3Client.send(new PutObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: `originals/${fileName}`,
            Body: imageData,
            ContentType: 'image/jpeg'
        }));

        // Resize image
        const resizedImage = await sharp(imageData)
            .resize(800, 600, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .toBuffer();

        // Upload resized image
        await s3Client.send(new PutObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: `resized/${fileName}`,
            Body: resizedImage,
            ContentType: 'image/jpeg'
        }));

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({
                message: 'Image processed successfully',
                originalPath: `originals/${fileName}`,
                resizedPath: `resized/${fileName}`
            })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({
                message: 'Error processing image',
                error: error.message
            })
        };
    }
};