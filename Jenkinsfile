pipeline {
    agent any

    environment {
        // Create a Jenkins "Username with password" credential with this ID,
        // using your Docker Hub username + an access token as the password.
        DOCKERHUB_CREDENTIALS = credentials('dockerhub-creds')

        // Replace with your Docker Hub username/repo
        IMAGE_NAME = 'yourdockerhubusername/two-tier-web'
        IMAGE_TAG  = "${env.BUILD_NUMBER}"
    }

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    stages {

        stage('Checkout') {
            steps {
                // Replace with your repo URL
                git branch: 'main', url: 'https://github.com/Prathip2826/two-tier-webapp.git'
            }
        }

        stage('Install Dependencies') {
            steps {
                dir('app') {
                    sh 'npm install'
                }
            }
        }

        stage('Run Tests') {
            steps {
                dir('app') {
                    sh 'npm test'
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                dir('app') {
                    sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -t ${IMAGE_NAME}:latest ."
                }
            }
        }

        stage('Push to Docker Hub') {
            steps {
                sh 'echo $DOCKERHUB_CREDENTIALS_PSW | docker login -u $DOCKERHUB_CREDENTIALS_USR --password-stdin'
                sh "docker push ${IMAGE_NAME}:${IMAGE_TAG}"
                sh "docker push ${IMAGE_NAME}:latest"
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    docker compose down || true
                    docker compose up -d --build
                '''
            }
        }

        stage('Smoke Test') {
            steps {
                sh '''
                    sleep 10
                    curl -f http://localhost:3000/health
                '''
            }
        }
    }

    post {
        always {
            sh 'docker logout || true'
        }
        success {
            echo 'Pipeline succeeded: app tier + db tier deployed and healthy.'
        }
        failure {
            echo 'Pipeline failed - check the stage logs above.'
        }
    }
}
