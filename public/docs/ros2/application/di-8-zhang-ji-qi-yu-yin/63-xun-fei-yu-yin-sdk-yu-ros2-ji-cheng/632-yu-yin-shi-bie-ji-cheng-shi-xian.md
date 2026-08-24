### 6.3.2 语音识别集成实现

#### 1.语音识别核心实现

功能包ros2\_xf\_bridge的src目录下，新建C++文件v2t.cpp，并编辑文件，输入如下内容：

```cpp
/*
 * 语音听写(iFly Auto Transform)技术能够实时地将语音转换成对应的文字。
 */

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <termio.h>

#include "ros2_xf_bridge/qisr.h"
#include "ros2_xf_bridge/msp_cmn.h"
#include "ros2_xf_bridge/msp_errors.h"
#include "ros2_xf_bridge/speech_recognizer.h"

#include "rclcpp/rclcpp.hpp"
#include "std_msgs/msg/string.hpp"

int wakeupFlag = 0;
int resultFlag = 0;

#define FRAME_LEN 640
#define BUFFER_SIZE 4096

/* Upload User words */
static int upload_userwords()
{
  char *userwords = NULL;
  size_t len = 0;
  size_t read_len = 0;
  FILE *fp = NULL;
  int ret = -1;

  fp = fopen("userwords.txt", "rb");
  if (NULL == fp)
  {
    printf("\nopen [userwords.txt] failed! \n");
    goto upload_exit;
  }

  fseek(fp, 0, SEEK_END);
  len = ftell(fp);
  fseek(fp, 0, SEEK_SET);

  userwords = (char *)malloc(len + 1);
  if (NULL == userwords)
  {
    printf("\nout of memory! \n");
    goto upload_exit;
  }

  read_len = fread((void *)userwords, 1, len, fp);
  if (read_len != len)
  {
    printf("\nread [userwords.txt] failed!\n");
    goto upload_exit;
  }
  userwords[len] = '\0';

  MSPUploadData("userwords", userwords, len, "sub = uup, dtt = userword", &ret); // ÉÏ´«ÓÃ»§´Ê±í
  if (MSP_SUCCESS != ret)
  {
    printf("\nMSPUploadData failed ! errorCode: %d \n", ret);
    goto upload_exit;
  }

upload_exit:
  if (NULL != fp)
  {
    fclose(fp);
    fp = NULL;
  }
  if (NULL != userwords)
  {
    free(userwords);
    userwords = NULL;
  }

  return ret;
}

static void show_result(char *string, char is_over)
{
  resultFlag = 1;

  printf("\rResult: [ %s ]", string);
  if (is_over)
    putchar('\n');
}

static char *g_result = NULL;
static unsigned int g_buffersize = BUFFER_SIZE;

void on_result(const char *result, char is_last)
{
  if (result)
  {
    size_t left = g_buffersize - 1 - strlen(g_result);
    size_t size = strlen(result);
    if (left < size)
    {
      g_result = (char *)realloc(g_result, g_buffersize + BUFFER_SIZE);
      if (g_result)
        g_buffersize += BUFFER_SIZE;
      else
      {
        printf("mem alloc failed\n");
        return;
      }
    }
    strncat(g_result, result, size);
    show_result(g_result, is_last);
  }
}
void on_speech_begin()
{
  if (g_result)
  {
    free(g_result);
  }
  g_result = (char *)malloc(BUFFER_SIZE);
  g_buffersize = BUFFER_SIZE;
  memset(g_result, 0, g_buffersize);

  printf("Start Listening...\n");
}
void on_speech_end(int reason)
{
  if (reason == END_REASON_VAD_DETECT)
    printf("\nSpeaking done \n");
  else
    printf("\nRecognizer error %d\n", reason);
}

/* demo send audio data from a file */
static void demo_file(const char *audio_file, const char *session_begin_params)
{
  int errcode = 0;
  FILE *f_pcm = NULL;
  char *p_pcm = NULL;
  unsigned long pcm_count = 0;
  unsigned long pcm_size = 0;
  unsigned long read_size = 0;
  struct speech_rec iat;
  struct speech_rec_notifier recnotifier = {
      on_result,
      on_speech_begin,
      on_speech_end};

  if (NULL == audio_file)
    goto iat_exit;

  f_pcm = fopen(audio_file, "rb");
  if (NULL == f_pcm)
  {
    printf("\nopen [%s] failed! \n", audio_file);
    goto iat_exit;
  }

  fseek(f_pcm, 0, SEEK_END);
  pcm_size = ftell(f_pcm);
  fseek(f_pcm, 0, SEEK_SET);

  p_pcm = (char *)malloc(pcm_size);
  if (NULL == p_pcm)
  {
    printf("\nout of memory! \n");
    goto iat_exit;
  }

  read_size = fread((void *)p_pcm, 1, pcm_size, f_pcm);
  if (read_size != pcm_size)
  {
    printf("\nread [%s] error!\n", audio_file);
    goto iat_exit;
  }

  errcode = sr_init(&iat, session_begin_params, SR_USER, &recnotifier);
  if (errcode)
  {
    printf("speech recognizer init failed : %d\n", errcode);
    goto iat_exit;
  }

  errcode = sr_start_listening(&iat);
  if (errcode)
  {
    printf("\nsr_start_listening failed! error code:%d\n", errcode);
    goto iat_exit;
  }

  while (1)
  {
    unsigned int len = 10 * FRAME_LEN; /* 200ms audio */
    int ret = 0;

    if (pcm_size < 2 * len)
      len = pcm_size;
    if (len <= 0)
      break;

    ret = sr_write_audio_data(&iat, &p_pcm[pcm_count], len);

    if (0 != ret)
    {
      printf("\nwrite audio data failed! error code:%d\n", ret);
      goto iat_exit;
    }

    pcm_count += (long)len;
    pcm_size -= (long)len;
  }

  errcode = sr_stop_listening(&iat);
  if (errcode)
  {
    printf("\nsr_stop_listening failed! error code:%d \n", errcode);
    goto iat_exit;
  }

iat_exit:
  if (NULL != f_pcm)
  {
    fclose(f_pcm);
    f_pcm = NULL;
  }
  if (NULL != p_pcm)
  {
    free(p_pcm);
    p_pcm = NULL;
  }

  sr_stop_listening(&iat);
  sr_uninit(&iat);
}

/* demo recognize the audio from microphone */
static void demo_mic(const char *session_begin_params)
{
  int errcode;
  int i = 0;

  struct speech_rec iat;

  struct speech_rec_notifier recnotifier = {
      on_result,
      on_speech_begin,
      on_speech_end};

  errcode = sr_init(&iat, session_begin_params, SR_MIC, &recnotifier);
  if (errcode)
  {
    printf("speech recognizer init failed\n");
    return;
  }
  errcode = sr_start_listening(&iat);
  if (errcode)
  {
    printf("start listen failed %d\n", errcode);
  }
  /* demo 15 seconds recording */
  // while (i++ < 15)
  //     sleep(1);
  int ch;
  while (1)
  {
    ch = getchar();
    if (ch == 32)
    {
      printf("\nSpeaking done \n");
      break;
    }
  }

  errcode = sr_stop_listening(&iat);
  if (errcode)
  {
    printf("stop listening failed %d\n", errcode);
  }

  sr_uninit(&iat);
}

/* main thread: start/stop record ; query the result of recgonization.
 * record thread: record callback(data write)
 * helper thread: ui(keystroke detection)
 */

int main(int argc, char *argv[])
{

  rclcpp::init(argc, argv);

  rclcpp::Rate loop_rate(10);

  auto node = std::make_shared<rclcpp::Node>("v2t_node");

  // 注意此处参数 appid 的设置,需要根据自己应用的 appid 自行修改
  node->declare_parameter("appid","d7389bad");

  auto voiceWordsPub = node->create_publisher<std_msgs::msg::String>("voicewords", 10);

  termios tms_old, tms_new;
  tcgetattr(0, &tms_old);
  tms_new = tms_old;
  tms_new.c_lflag &= ~(ICANON | ECHO);
  tcsetattr(0, TCSANOW, &tms_new);

  RCLCPP_INFO(node->get_logger(), "Press \"Space\" key to Start,Press \"Enter\" key to Exit.");
  int count = 0;
  int ch;
  while (rclcpp::ok())
  {
    ch = getchar();
    printf("Pressed Key Value %d\n", ch);
    if (ch == 32)
    { // Space key
      wakeupFlag = 1;
    }
    if (ch == 10)
    { // Enter key
      RCLCPP_INFO(node->get_logger(), "Node Exit.");
      break;
    }
    if (wakeupFlag)
    {
      int ret = MSP_SUCCESS;
      int upload_on = 1; /* whether upload the user word */
      /* login params, please do keep the appid correct */
      std::string lp = "appid = " + node->get_parameter("appid").as_string() + ", work_dir = .";
      const char *login_params = lp.c_str();
      int aud_src = 0; /* from mic or file */

      /*
       * See "iFlytek MSC Reference Manual"
       */
      const char *session_begin_params =
          "sub = iat, domain = iat, language = zh_cn, "
          "accent = mandarin, sample_rate = 16000, "
          "result_type = plain, result_encoding = utf8";

      /* Login first. the 1st arg is username, the 2nd arg is password
       * just set them as NULL. the 3rd arg is login paramertes
       * */
      ret = MSPLogin(NULL, NULL, login_params);
      if (MSP_SUCCESS != ret)
      {
        MSPLogout();
        printf("MSPLogin failed , Error code %d.\n", ret);
        // goto exit; // login fail, exit the program
      }
      printf("Demo recognizing the speech from microphone\n");

      demo_mic(session_begin_params);

      wakeupFlag = 0;
      MSPLogout();
    }
    // 语音识别完成
    if (resultFlag)
    {
      resultFlag = 0;
      std_msgs::msg::String msg;
      msg.data = g_result;
      voiceWordsPub->publish(msg);
    }
    rclcpp::spin_some(node);
    loop_rate.sleep();
    count++;
  }

exit:
  tcsetattr(0, TCSANOW, &tms_old);
  MSPLogout(); // Logout...
  return 0;
}
```

在上述文件中，需要注意我们设置了一个名为`appid`的参数，该参数的值是你在讯飞开放平台创建应用时生成的值，该值需要动态调整。

#### 2.编辑配置文件

CMakeLists.txt 中需要添加的配置如下：

```Cmake
add_executable(v2t src/v2t.cpp src/speech_recognizer.c src/linuxrec.c)

target_link_libraries(v2t
  ${catkin_LIBRARIES}
  libmsc.so -ldl -lpthread -lm -lrt -lasound
)

target_include_directories(v2t PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>)
ament_target_dependencies(
  v2t
  "rclcpp"
  "std_msgs"
  "geometry_msgs"
)

install(TARGETS v2t
  DESTINATION lib/${PROJECT_NAME})

install(
  DIRECTORY include/
    DESTINATION include
)
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select ros2_xf_bridge
```

#### 4.执行

当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run ros2_xf_bridge v2t
```

再新建一个终端，可以打印订阅到的语音转文本相关话题数据，指令如下：

```
ros2 topic echo /voicewords
```

按下空格，可以开始录入语音，再次按下空格则结束录制。录制生成的文本会在第二个终端中被一并输出。

