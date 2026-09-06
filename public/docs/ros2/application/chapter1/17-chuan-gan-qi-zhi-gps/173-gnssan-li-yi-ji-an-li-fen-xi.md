### 1.8.3 GNSS案例以及案例分析

#### 1.案例需求

**需求：**编写程序，订阅GNSS消息，然后生成并发布机器人的运动轨迹信息。

![](/assets/1.8.3_GNSS案例.gif)

#### 2.案例分析

在上述案例中，需要关注的要素有两个：

1. 将GNSS消息转换成“轨迹”消息并发布的程序；
2. 将“轨迹”消息可视化的rviz2；

在GNSS信息中包含了机器人某一时刻的经纬度以及海拔高度等信息，我们可以订阅GNSS消息，将订阅到的机器人位姿转换成以米为单位的坐标点数据，然后再将这些坐标点组合到一起从而生成机器人的运行轨迹并发布，最后再通过rviz2可视化的显示运行轨迹。另外，由于GNSS在室内时数据采集效果不理想，而室外操作又不方便，那么我们可以在室外通过 ros2 bag 提前采集数据，当我们需要使用数据时则直接回放 bag 文件即可，这样就提高了学习和工作的效率。

#### 3.流程简介

具体到其实现，主要步骤如下：

1. 编写程序；
2. 编辑配置文件；
3. 编译；
4. 执行；
5. 使用rviz2查看结果。

案例我们会采用C++和Python分别实现，二者都遵循上述实现流程。

#### 4.准备工作

终端下进入工作空间的src目录，调用如下两条命令分别创建C++功能包和Python功能包。

```
ros2 pkg create cpp05_gnss --dependencies rclcpp sensor_msgs nav_msgs geometry_msgs
ros2 pkg create py05_gnss --build-type ament_python --dependencies rclpy sensor_msgs nav_msgs geometry_msgs
```

GNSS消息接口依赖于sensor\_msgs包，轨迹消息接口则依赖于nav\_msgs包以及geometry\_msgs包。

