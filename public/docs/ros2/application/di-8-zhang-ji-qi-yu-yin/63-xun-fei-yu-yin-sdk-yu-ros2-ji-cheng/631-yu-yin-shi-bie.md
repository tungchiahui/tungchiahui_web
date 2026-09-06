### 6.3.1 需求分析

#### 1.需求说明

**需求1：**将ROS2与讯飞语音的语音识别功能相集成，可以将语音转换成文本，并以话题的方式发布识别后的文本。

![](/assets/6.3.1_语音识别.PNG)

**需求2：**将ROS2与讯飞语音的语音合成功能相集成，可以以话题的方式订阅文本，并将订阅到的文本合成为语音。

![](/assets/6.3.1_语音合成.PNG)

#### 2.案例分析

在上述两个案例中，需要调用讯飞语音SDK提供的相关接口，在了解主要接口实现的前提下（可以参考SDK中`samples`目录中的相关案例），再与ROS2相集成。

#### 3.流程简介

两个案例的实现流程类似，主要步骤如下：

1. 编写功能集成的节点实现；
2. 编辑配置文件；
3. 编译；
4. 执行。

#### 4.准备工作

终端下进入工作空间的src目录，调用如下指令创建一个功能包：

```
ros2 pkg create ros2_xf_bridge --build-type ament_cmake --dependencies rclcpp std_msgs geometry_msgs
```

另外，还需要将讯飞语音SDK中的一些头文件复制进当前功能包：

* 把科大讯飞SDK下inclue目录中的头文件拷贝到功能包的头文件目录中。
* 把SDK中/samples/iat\_online\_record\_sample/目录中所有的.h文件复制到功能包的头文件目录中。
* 把SDK中/samples/iat\_online\_record\_sample/目录中所有的.c文件复制到功能包的源文件目录中。

主备完毕后的功能包目录结构如下所示：

```
.
├── CMakeLists.txt
├── include
│   └── ros2_xf_bridge
│       ├── formats.h
│       ├── linuxrec.h
│       ├── msp_cmn.h
│       ├── msp_errors.h
│       ├── msp_types.h
│       ├── qise.h
│       ├── qisr.h
│       ├── qtts.h
│       └── speech_recognizer.h
├── package.xml
└── src
    ├── iat_online_record_sample.c
    ├── linuxrec.c
    └── speech_recognizer.c
```

另外，`src`下的`linuxrec.c`和`speech_recognizer.c`文件还需要修改头文件路径。

`linuxrec.c`修改前：

```
#include "formats.h"
#include "linuxrec.h"
```

`linuxrec.c`修改后：

```
#include "ros2_xf_bridge/formats.h"
#include "ros2_xf_bridge/linuxrec.h"
```

`speech_recognizer.c`修改前：

```
#include "speech_recognizer.h"
#include "qisr.h"
#include "msp_cmn.h"
#include "msp_errors.h"
#include "linuxrec.h"
```

`speech_recognizer.c`修改后：

```
#include "ros2_xf_bridge/speech_recognizer.h"
#include "ros2_xf_bridge/qisr.h"
#include "ros2_xf_bridge/msp_cmn.h"
#include "ros2_xf_bridge/msp_errors.h"
#include "ros2_xf_bridge/linuxrec.h"
```



