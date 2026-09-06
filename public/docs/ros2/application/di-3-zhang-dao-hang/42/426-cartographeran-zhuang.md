### 4.2.6 cartographer安装

借助于Ubuntu的包资源管理器，可以使用二进制的方式安装cartographer，安装指令如下：

```
sudo apt install ros-<ros2-distro>-cartographer
sudo apt install ros-<ros2-distro>-cartographer-ros
```

上述两条安装指令中，前者用于安装cartographer的核心库，这个包不直接与ROS2集成，而是作为一个独立的算法库存在，为地图构建和定位提供底层的计算支持。后者则是cartographer在ROS2环境下的封装，它提供了与ROS2系统的接口，使得Cartographer算法能够在ROS2环境中运行。另外指令中的`<ros2-distro>`请替换成当前所使用的ROS2版本。

