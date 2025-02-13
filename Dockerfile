# Use AWS Lambda Node.js base image
FROM public.ecr.aws/lambda/nodejs:18

# Install build dependencies
RUN yum install -y gcc-c++ make

# Set working directory
WORKDIR ${LAMBDA_TASK_ROOT}

# Copy package files
COPY package*.json ./

# Install dependencies including Sharp
RUN npm install

# Copy function code
COPY index.js ./

# Set the handler
CMD [ "index.handler" ]