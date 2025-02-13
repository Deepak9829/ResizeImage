# Provider configuration
provider "aws" {
  region = "ap-southeast-1"
}

# S3 bucket for storing images
resource "aws_s3_bucket" "image_bucket" {
  bucket = "my-image-resize-bucket-test"
}

# S3 bucket versioning
resource "aws_s3_bucket_versioning" "image_bucket_versioning" {
  bucket = aws_s3_bucket.image_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 bucket public access block
resource "aws_s3_bucket_public_access_block" "image_bucket_public_access" {
  bucket = aws_s3_bucket.image_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# IAM role for Lambda
resource "aws_iam_role" "lambda_role" {
  name = "image_resize_lambda_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# IAM policy for Lambda
resource "aws_iam_role_policy" "lambda_policy" {
  name = "image_resize_lambda_policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          "${aws_s3_bucket.image_bucket.arn}",
          "${aws_s3_bucket.image_bucket.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_iam_policy" "lambda_ecr_full_access" {
  name        = "LambdaECRFullAccess"
  description = "Grants full access to ECR for Lambda functions"
  policy      = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:ListImages",
          "ecr:DescribeRepositories",
          "ecr:GetAuthorizationToken",
          "ecr:CreateRepository",
          "ecr:DeleteRepository",
          "ecr:PutImage",
          "ecr:DeleteImage",
          "ecr:ListTagsForResource",
          "ecr:BatchDeleteImage",
          "ecr:SetRepositoryPolicy",
          "ecr:DeleteRepositoryPolicy"
        ],
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_ecr_full_access" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_ecr_full_access.arn
}

# Lambda function
resource "aws_lambda_function" "image_resize" {
  package_type    = "Image"
  image_uri       = "194428989522.dkr.ecr.ap-southeast-1.amazonaws.com/resizeimage:v1.0.2"
  function_name   = "image_resize_function"
  role            = aws_iam_role.lambda_role.arn
  timeout         = 300
  memory_size     = 512
  architectures   = ["arm64"]  # ✅ Explicitly set ARM architecture


  environment {
    variables = {
      BUCKET_NAME = aws_s3_bucket.image_bucket.id
    }
  }
}



# API Gateway REST API
resource "aws_api_gateway_rest_api" "image_api" {
  name = "image_resize_api"
}

# API Gateway Resource
resource "aws_api_gateway_resource" "image_resource" {
  rest_api_id = aws_api_gateway_rest_api.image_api.id
  parent_id   = aws_api_gateway_rest_api.image_api.root_resource_id
  path_part   = "upload"
}

# API Gateway Method
resource "aws_api_gateway_method" "image_method" {
  rest_api_id   = aws_api_gateway_rest_api.image_api.id
  resource_id   = aws_api_gateway_resource.image_resource.id
  http_method   = "POST"
  authorization = "NONE"
}

# API Gateway Integration
resource "aws_api_gateway_integration" "lambda_integration" {
  rest_api_id = aws_api_gateway_rest_api.image_api.id
  resource_id = aws_api_gateway_resource.image_resource.id
  http_method = aws_api_gateway_method.image_method.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.image_resize.invoke_arn
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.image_resize.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.image_api.execution_arn}/*/*"
}

# API Gateway Deployment
resource "aws_api_gateway_deployment" "image_api_deployment" {
  rest_api_id = aws_api_gateway_rest_api.image_api.id
  depends_on  = [aws_api_gateway_integration.lambda_integration]
}

# API Gateway Stage
resource "aws_api_gateway_stage" "image_api_stage" {
  deployment_id = aws_api_gateway_deployment.image_api_deployment.id
  rest_api_id   = aws_api_gateway_rest_api.image_api.id
  stage_name    = "prod"
}

# Output values
output "api_endpoint" {
  value = "${aws_api_gateway_stage.image_api_stage.invoke_url}/upload"
}

output "bucket_name" {
  value = aws_s3_bucket.image_bucket.id
}