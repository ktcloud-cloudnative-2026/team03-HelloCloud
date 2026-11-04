pipeline {
  agent { label 'agent' }

  options {
    timeout(time: 15, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  stages {
    stage('Detect changes') {
      steps {
        script {
          if (env.CHANGE_TARGET) {
            sh """
              git fetch --no-tags origin +refs/heads/${env.CHANGE_TARGET}:refs/remotes/origin/${env.CHANGE_TARGET}
              git diff --name-only origin/${env.CHANGE_TARGET}...HEAD > changed-files.txt
            """
          } else {
            sh 'git diff --name-only HEAD~1 HEAD > changed-files.txt'
          }
          env.CHANGED_FILES = readFile('changed-files.txt').trim()
          env.DEPLOY_CHANGED = sh(script: "grep -q '^deploy/' changed-files.txt", returnStatus: true) == 0 ? 'true' : 'false'
          echo "바뀐 파일:\n${env.CHANGED_FILES}"
          echo "deploy/ 변경: ${env.DEPLOY_CHANGED}"
        }
      }
    }

    stage('Validate deploy') {
      when { environment name: 'DEPLOY_CHANGED', value: 'true' }
      steps {
        sh 'bash deploy/scripts/validate.sh'
      }
    }
  }
}