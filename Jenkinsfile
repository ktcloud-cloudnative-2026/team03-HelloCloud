// IDCN CI: 수업 실습(cicd-lab)의 흐름을 팀 저장소(모노레포)에 맞춘 버전
// 흐름: 시작 조건 → deploy 검사 → 테스트 → 빌드 → 스캔 → 올리기 → 매니페스트 갱신
pipeline {
  agent { label 'agent' }                          // 수업: agent any → 우리: 에이전트 컨테이너에서만 실행 (컨트롤러는 일을 안 함)

  options {
    disableConcurrentBuilds()                      // 같은 브랜치 빌드는 한 번에 하나씩
    timeout(time: 30, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }
  // triggers 없음: 멀티브랜치 잡이 2분마다 GitHub를 확인한다 (deploy/ci/jenkins.yaml)

  // GitHub 토큰은 여기서 꺼내지 않는다. 쓰기 권한이 필요한 main의 '올리기', '매니페스트 갱신'에서만
  // withCredentials로 꺼낸다 (최소 권한. PR 검사는 토큰 없이 돈다)
  environment {
    ORG      = 'ktcloud-cloudnative-2026'
    REPO     = 'team03-HelloCloud'
    REGISTRY = 'ghcr.io/ktcloud-cloudnative-2026'  // 이미지는 개인 계정이 아니라 조직 아래에 올린다
  }

  stages {
    stage('시작 조건') {
      // 이번 커밋(또는 PR)에서 바뀐 서비스 폴더와 deploy/ 변경 여부를 찾는다
      steps {
        script {
          env.TAG = env.GIT_COMMIT.take(7)         // 이미지 태그 = 커밋 7자리 (팀 규칙)
          def base = 'HEAD~1'
          if (env.CHANGE_TARGET) {                 // PR이면 PR 대상(main)과 비교
            sh "git fetch --no-tags origin +refs/heads/${env.CHANGE_TARGET}:refs/remotes/origin/${env.CHANGE_TARGET}"
            base = "origin/${env.CHANGE_TARGET}"
          }
          def files = sh(script: "git diff --name-only ${base}...HEAD", returnStdout: true).trim().split('\n').findAll { it }

          // services/board-service/src/... → board-service
          def dirs = files.findAll { it.startsWith('services/') }.collect { it.tokenize('/')[1] }.unique()
          // 공통 라이브러리(libs)를 바꾸면 Spring 서비스 5개를 모두 다시 검사
          def spring = ['user-service', 'file-service', 'calendar-service', 'notification-service', 'board-service']
          if (dirs.contains('libs')) { dirs = (dirs + spring).unique() }
          // Dockerfile이 있는 서비스 폴더와 web만 남긴다
          env.SERVICES = dirs.findAll { (it.endsWith('-service') || it == 'web') && fileExists("services/${it}/Dockerfile") }.join(' ')
          env.DEPLOY_CHANGED = files.any { it.startsWith('deploy/') } ? 'true' : 'false'

          echo "바뀐 서비스: ${env.SERVICES ?: '없음'} / deploy 변경: ${env.DEPLOY_CHANGED}"
          if (!env.SERVICES && env.DEPLOY_CHANGED == 'false') {
            currentBuild.description = '서비스 · deploy 변경 없음'
          }
        }
      }
    }

    stage('deploy 검사') {
      when { environment name: 'DEPLOY_CHANGED', value: 'true' }
      steps { sh 'bash deploy/scripts/validate.sh' }
    }

    stage('테스트') {
      when { expression { env.SERVICES } }
      steps {
        script {
          for (svc in env.SERVICES.split(' ')) {
            // 언어와 상관없이 각 서비스 Dockerfile의 test 단계까지만 빌드 (테스트가 실패하면 여기서 멈춤)
            sh "docker build --target test -f services/${svc}/Dockerfile services"
          }
        }
      }
    }

    stage('빌드') {
      when { expression { env.SERVICES } }
      steps {
        script {
          for (svc in env.SERVICES.split(' ')) {
            sh "docker build -f services/${svc}/Dockerfile -t ${REGISTRY}/idcn-${svc}:${TAG} services"
          }
        }
      }
    }

    stage('스캔') {
      when { expression { env.SERVICES } }
      steps {
        script {
          for (svc in env.SERVICES.split(' ')) {
            sh "trivy image --cache-dir /home/jenkins/.trivy --exit-code 1 --severity CRITICAL --ignore-unfixed ${REGISTRY}/idcn-${svc}:${TAG}"
          }
        }
      }
    }

    stage('올리기') {
      when { allOf { branch 'main'; expression { env.SERVICES } } }   // PR에서는 검사만, main에 머지된 뒤에만 올린다
      steps {
        withCredentials([usernamePassword(credentialsId: 'github-token', usernameVariable: 'GH_USR', passwordVariable: 'GH_PSW')]) {
          sh 'echo "$GH_PSW" | docker login ghcr.io -u "$GH_USR" --password-stdin'
          script {
            for (svc in env.SERVICES.split(' ')) {
              sh "docker push ${REGISTRY}/idcn-${svc}:${TAG}"
            }
          }
        }
      }
    }

    stage('매니페스트 갱신') {
      // 수업과 같이 main에 바로 push (main 보호 규칙에서 Jenkins 토큰 계정만 예외로 허용해야 함)
      when { allOf { branch 'main'; expression { env.SERVICES } } }
      steps {
        withCredentials([usernamePassword(credentialsId: 'github-token', usernameVariable: 'GH_USR', passwordVariable: 'GH_PSW')]) {
          sh '''
            git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
            git checkout -B main origin/main
            for svc in $SERVICES; do
              f="deploy/values/${svc}/values-dev.yaml"
              if [ -f "$f" ]; then
                yq -i '.image.tag = strenv(TAG)' "$f"
              else
                echo "values 파일 없음: $f (건너뜀)"
              fi
            done
            if git diff --quiet; then
              echo "바꿀 values 파일이 없어 push하지 않습니다"
              exit 0
            fi
            git -c user.name="idcn-jenkins" -c user.email="jenkins@idcn.local" commit -am "ci: dev 이미지 ${TAG} 반영 [skip ci]"
            git pull --rebase "https://${GH_USR}:${GH_PSW}@github.com/${ORG}/${REPO}.git" main
            git push "https://${GH_USR}:${GH_PSW}@github.com/${ORG}/${REPO}.git" main
          '''
        }
      }
    }
  }

  post {
    always { sh 'docker logout ghcr.io || true' }
  }
}
