const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

const s3Client = new S3Client({});

function getBase64Data(base64String) {
    // Remove data URI prefix if present (e.g., "data:image/jpeg;base64,...")
    const matches = base64String.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
    return matches ? matches[2] : base64String;
}

exports.handler = async (event) => {
    try {
        // Parse request body
        const body = JSON.parse(event.body);
        if (!body.image) {
            throw new Error("Missing 'image' in request body");
        }

        const base64Data = getBase64Data(body.image);
        const imageData = Buffer.from(base64Data, 'base64');

        // Validate image format
        const metadata = await sharp(imageData).metadata();
        console.log('Image metadata:', metadata);
        if (!metadata.format) {
            throw new Error("Unsupported image format");
        }

        const fileExtension = metadata.format; // e.g., "jpeg", "png"
        const fileName = body.fileName || `image-${Date.now()}.${fileExtension}`;

        const bucketName = process.env.BUCKET_NAME;
        if (!bucketName) {
            throw new Error("Missing environment variable: BUCKET_NAME");
        }

        // Upload original image to S3
        await s3Client.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: `originals/${fileName}`,
            Body: imageData,
            ContentType: `image/${fileExtension}`
        }));

        // Resize image
        const resizedImage = await sharp(imageData)
            .resize(800, 600, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .toBuffer();

        // Upload resized image to S3
        await s3Client.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: `resized/${fileName}`,
            Body: resizedImage,
            ContentType: `image/${fileExtension}`
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
