### 3.3.2 Ignition Gazebo与ROS2集成

本节将介绍如何实现Ignition Gazebo与ROS2的集成，以实现二者之间的交互，比如，可以通过ROS2的键盘控制节点控制机器人运动，并且在rviz2中显示机器人的里程计数据。其流程大致如下：

1. 启动 Ignition Gazebo 仿真环境；
2. 通过 ros\_gz\_bridge 建立 ROS2 与 Ignition Gazebo 的连接；
3. 启动 ROS2 相关节点实现与 Ignition Gazebo 的数据收发。

Ignition Gazebo与ROS2的的所有集成实现，基本都遵循上述流程。

#### 1.启动仿真环境

在 Ignition Gazebo 安装时，已经内置了一些仿真环境，直接启动即可。在此我们可以使用名为`visualize_lidar.sdf`的仿真文件，该文件对应的仿真环境中包括了差速机器人以及激光雷达的仿真。启动指令如下：

```
ign gazebo -v 4 -r visualize_lidar.sdf
```

或者也可以以ROS2 launch的方式启动，指令如下：

```
ros2 launch ros_gz_sim gz_sim.launch.py gz_args:="-v 4 -r visualize_lidar.sdf" # 启动状态
```

两种方式本质相同，都是启动了Ignition Gazebo并且加载了visualize\_lidar.sdf文件。

#### 2.建立连接

虽然仿真环境中的机器人已经配置了运动控制插件，可以通过`/model/vehicle_blue/cmd_vel`话题订阅速度指令并运动，但是Ignition Gazebo与ROS2中的消息格式并不一致，所以还需要通过ros\_gz\_bridge这一桥接功能包，实现二者之间消息的转换，调用指令如下：

```
ros2 run ros_gz_bridge parameter_bridge /model/vehicle_blue/cmd_vel@geometry_msgs/msg/Twist]gz.msgs.Twist
```

通过该指令可以将发布在`/model/vehicle_blue/cmd_vel`话题上的`geometry_msgs/msg/Twist`类型的ROS2消息转换成可以被Ignition Gzebo识别的`gz.msgs.Twist`类型的消息。

#### 3.启动ROS2节点

启动ROS2的键盘控制节点，并将话题重映射为`/model/vehicle_blue/cmd_vel`，指令如下：

```
ros2 run teleop_twist_keyboard teleop_twist_keyboard --ros-args -r /cmd_vel:=/model/vehicle_blue/cmd_vel
```

接下来就可以使用键盘控制机器人运动了。

![](/assets/3.3.2_集成演示.gif)

