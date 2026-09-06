### 3.3.8 Ignition Gazebo运动控制器

本节将介绍如何让你的机器人动起来。

#### 1.修改URDF文件

arduino.urdf 和 stm32\_2w.urdf 文件中，在`<robot>`根标签下添加如下代码：

```xml
  <!-- 运动控制插件 -->
  <gazebo>
      <plugin filename="libignition-gazebo-diff-drive-system.so"
        name="ignition::gazebo::systems::DiffDrive">
        <left_joint>left_joint</left_joint>
        <right_joint>right_joint</right_joint>
        <wheel_separation>0.2097</wheel_separation>
        <wheel_radius>0.03415</wheel_radius>
        <odom_publish_frequency>10</odom_publish_frequency>
        <frame_id>odom</frame_id>
        <child_frame_id>base_footprint</child_frame_id>
        <topic>/cmd_vel</topic>
        <max_linear_acceleration>10</max_linear_acceleration>
        <min_linear_acceleration>-10</min_linear_acceleration>
        <max_angular_acceleration>10</max_angular_acceleration>
        <min_angular_acceleration>-10</min_angular_acceleration>
        <max_linear_velocity>0.5</max_linear_velocity>
        <min_linear_velocity>-0.5</min_linear_velocity>
        <max_angular_velocity>1</max_angular_velocity>
        <min_angular_velocity>-1</min_angular_velocity>
      </plugin>

  </gazebo>

  <!-- 关节状态发布 -->
  <gazebo>
    <plugin filename="ignition-gazebo-joint-state-publisher-system"
      name="ignition::gazebo::systems::JointStatePublisher">
    </plugin>
  </gazebo>
```

stm32\_4w.urdf 文件中，在`<robot>`根标签下添加如下代码：

```xml
<!-- 运动控制插件 -->
<gazebo>
    <plugin
        filename="ignition-gazebo-diff-drive-system"
        name="ignition::gazebo::systems::DiffDrive">
        <left_joint>left_former_joint</left_joint>
        <left_joint>left_rear_joint</left_joint>
        <right_joint>right_former_joint</right_joint>
        <right_joint>right_rear_joint</right_joint>
        <wheel_separation>0.4</wheel_separation>
        <wheel_radius>0.0415</wheel_radius>
        <odom_publish_frequency>50</odom_publish_frequency>
        <frame_id>odom</frame_id>
        <child_frame_id>base_footprint</child_frame_id>
        <topic>/cmd_vel</topic>
        <max_linear_acceleration>10</max_linear_acceleration>
        <min_linear_acceleration>-10</min_linear_acceleration>
        <max_angular_acceleration>10</max_angular_acceleration>
        <min_angular_acceleration>-10</min_angular_acceleration>
        <max_linear_velocity>0.5</max_linear_velocity>
        <min_linear_velocity>-0.5</min_linear_velocity>
        <max_angular_velocity>1</max_angular_velocity>
        <min_angular_velocity>-1</min_angular_velocity>
      </plugin>
  </gazebo>
  <!-- 关节状态发布 -->
  <gazebo>
    <plugin filename="ignition-gazebo-joint-state-publisher-system"
      name="ignition::gazebo::systems::JointStatePublisher">
    </plugin>
  </gazebo>
```

#### 2.修改launch文件

修改gazebo\_sim\_world.launch.py文件，修改后的代码如下：

```py
import os

from ament_index_python.packages import get_package_share_directory

from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.actions import Node



def generate_launch_description():

    this_pkg = get_package_share_directory("demo_gazebo_sim")
    mycar_desc_pkg = get_package_share_directory("mycar_description")
    pkg_ros_gz_sim = get_package_share_directory("ros_gz_sim")
    world_file = os.path.join(this_pkg,"world","base.sdf")

    gz_sim = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(pkg_ros_gz_sim, "launch", "gz_sim.launch.py")),
        launch_arguments={
            "gz_args": "-r " + world_file
        }.items(),
    )
    mycar_desc = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(mycar_desc_pkg,"launch","mycar_desc_sim.launch.py")
        )
    )
    spawn = Node(package="ros_gz_sim", executable="create",
                arguments=[
                "-name", "mycar",
                "-x", "-4",
                "-z", "0.01", #设置为0,可能会陷进地里
                "-y", "0",
                "-topic", "/robot_description"],
            output="screen")

    # Bridge
    bridge = Node(
        package="ros_gz_bridge",
        executable="parameter_bridge",
        arguments=["/cmd_vel@geometry_msgs/msg/Twist@gz.msgs.Twist",
                   "/model/mycar/odometry@nav_msgs/msg/Odometry@gz.msgs.Odometry",
                   "/model/mycar/tf@tf2_msgs/msg/TFMessage[gz.msgs.Pose_V",
                   "/clock@rosgraph_msgs/msg/Clock[gz.msgs.Clock",
                   "/world/empty/model/mycar/joint_state@sensor_msgs/msg/JointState[gz.msgs.Model",
                   ],
        parameters=[{"qos_overrides./model/mycar.subscriber.reliability": "reliable"}],
        remappings=[
                ("/model/mycar/tf", "/tf"),
                ("/world/empty/model/mycar/joint_state","joint_states"),
                ("/model/mycar/odometry","/odom")
            ],
        output="screen"
    )

    return LaunchDescription([
        gz_sim,
        spawn,
        mycar_desc,
        bridge
    ])
```

#### 3.构建

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select mycar_description demo_gazebo_sim
```

#### 4.执行

终端中进入当前工作空间，调用如下指令执行launch文件：

```
. install/setup.bash
export MYCAR_MODEL=stm32_4w # MYCAR_MODEL值可以设置为arduino、stm32_2w 或stm32_4w
ros2 launch demo_gazebo_sim gazebo_sim_world.launch.py
```

再启动键盘控制节点，就可以控制机器人运动了。

还可以启动rviz2，以查看里程计消息以及坐标变换。终端中进入当前工作空间，调用如下指令执行launch文件：

```
. install/setup.bash
rviz2
```

![](/assets/3.3.8_运动控制.gif)

