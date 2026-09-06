### 3.2.1 stage\_ros2安装与运行

#### 1.安装

请先调用如下指令安装依赖：

```
sudo apt-get install git cmake g++ libjpeg8-dev libpng-dev libglu1-mesa-dev libltdl-dev libfltk1.1-dev
```

进入ROS2工作空间的src目录，调用如下指令下载相关仓库：

```
git clone https://github.com/damuxt/Stage.git
git clone https://github.com/damuxt/stage_ros2.git
```

进入工作空间目录，使用`colcon build`指令进行构建。

#### 2.节点说明

`stage_ros2`节点是stage\_ros2功能包的核心节点之一。它通过加载world文件来创建一个仿真场景，包括地图、障碍物和机器人等元素。world文件描述了虚拟环境的属性，节点会根据文件中的描述构建对应的环境。stage\_ros2节点利用这个虚拟环境来模拟机器人的运动、感知和控制。通过该节点和world文件的结合，可以进行机器人的仿真和测试。

#### 3.使用

在功能包下，已经内置了使用示例，终端下可以执行如下指令启动示例：

```
ros2 launch stage_ros2 my_house.launch.py
```

模拟器以及rviz2将被启动，并且在rviz2中可以显示里程计、激光雷达以及深度相机等相关信息，运行结果如下。

![](/assets/3.2.1_stage_ros2示例.PNG)

