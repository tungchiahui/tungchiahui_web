### 1.7.3 IMU案例以及案例分析

#### 1.案例需求

**需求：**编写程序，订阅机器人的imu消息，获取机器人姿态以发布机器人相对于其在地面投影的坐标变换。

![](/assets/1.6.3_IMU案例.gif)

#### 2.案例分析

上述案例本质是一个坐标变换广播实现，机器人可以视为一个坐标系（在此称之为mycar），其在地面上的投影可以视为另外一个坐标系（在此称之为world）。mycar相对于world，x轴和y轴上的偏移量为0，z轴上的偏移量可以自定义，而相对旋转角度也即姿态则可以从imu消息中获取。

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
ros2 pkg create cpp04_imu --dependencies rclcpp sensor_msgs tf2_ros geometry_msgs
ros2 pkg create py04_imu --build-type ament_python --dependencies rclpy sensor_msgs tf2_ros geometry_msgs
```

imu消息接口依赖于sensor\_msgs包，坐标变换实现则依赖于tf2\_ros包以及geometry\_msgs包。

