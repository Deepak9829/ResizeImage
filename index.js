const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

// Initialize the S3 client (You can add your region if needed)
const s3Client = new S3Client({
    region: 'ap-southeast-1'  // Replace with your AWS region
});

// Helper function to extract base64 string from incoming image data
function getBase64Data(base64String) {
    // Remove data URI prefix if present (e.g., "data:image/jpeg;base64,...")
    const matches = base64String.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
    if (matches) {
        return matches[2]; // Extract base64 data without the prefix
    }
    return base64String; // Return the base64 string as-is if it's already without prefix
}

exports.handler = async (event) => {
    try {
        // Parse request body
        const body = JSON.parse(event.body);
        if (!body.image) {
            throw new Error("Missing 'image' in request body");
        }

        // Extract base64 image data (handle both data URI and plain base64)
        const base64Data = getBase64Data(body.image);
        const imageData = Buffer.from(base64Data, 'base64');

        console.log('Received image data length:', imageData.length);  // Log the data size for debugging

        // Validate image format using sharp
        const metadata = await sharp(imageData).metadata();
        console.log('Image metadata:', metadata);  // Log metadata for further debugging

        if (!metadata.format) {
            throw new Error("Unsupported image format");
        }

        const fileExtension = metadata.format;  // e.g., "jpeg", "png"
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

        // Return success response
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"  // Enable CORS
            },
            body: JSON.stringify({
                message: 'Image processed successfully',
                originalPath: `originals/${fileName}`,
                resizedPath: `resized/${fileName}`
            })
        };
    } catch (error) {
        console.error('Error:', error);

        // Return error response
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
