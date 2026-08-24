### 6.3.1 需求分析

#### 1.需求说明

**需求1：**将ROS2与paddlespeech的语音识别功能相集成，可以将语音转换成文本，并以话题的方式发布识别后的文本。

![](/assets/6.5.1_需求1.PNG)

**需求2：**将ROS2与paddlespeech的语音合成功能相集成，可以以话题的方式订阅文本，并将订阅到的文本合成为语音。

![](/assets/6.5.1_需求2.PNG)

#### 2.案例分析

在上述两个案例中，需要调用paddlespeech提供的相关API接口，在了解主要接口实现的前提下，再与ROS2相集成。

#### 3.流程简介

两个案例的实现流程类似，主要步骤如下：

1. 编写功能集成的节点实现；
2. 编辑配置文件；
3. 编译；
4. 执行。

#### 4.准备工作

终端下进入工作空间的src目录，调用如下指令创建一个功能包：

```
ros2 pkg create ros2_ps_bridge --build-type ament_cmake --dependencies rclcpp std_msgs geometry_msgs
```

调用如下指令安装语音播放器：

```
pip install playsound
```



