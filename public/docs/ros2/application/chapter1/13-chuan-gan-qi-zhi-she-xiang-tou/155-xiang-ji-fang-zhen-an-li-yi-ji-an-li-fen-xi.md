### 1.6.4 单目相机仿真案例以及案例分析

#### 1.案例需求

**需求：**编写程序发布单目相机消息，并且在rviz2中显示，最终结果如下图所示。

![](/assets/1.5.5_相机仿真.PNG)

#### 2.案例分析

在上述案例中，需要关注的要素有两个：

1. 自定义的发布方程序；
2. 作为订阅方的rviz2；

发布方程序需要生成单目相机消息并发布，rviz2则订阅该消息并实现可视化，该案例本质也是一个发布订阅实现。

#### 3.流程简介

主要步骤如下：

1. 编写发布方实现；
2. 编辑配置文件；
3. 编译；
4. 执行；
5. 使用rviz2查看结果。

案例我们会采用C++和Python分别实现，二者都遵循上述实现流程。

#### 4.准备工作

终端下进入工作空间的src目录，调用如下两条命令分别创建C++功能包和Python功能包。

```
ros2 pkg create cpp03_camera --build-type ament_cmake --dependencies rclcpp sensor_msgs
ros2 pkg create py03_camera --build-type ament_python --dependencies rclpy sensor_msgs
```

图片消息接口依赖于sensor\_msgs功能包。

