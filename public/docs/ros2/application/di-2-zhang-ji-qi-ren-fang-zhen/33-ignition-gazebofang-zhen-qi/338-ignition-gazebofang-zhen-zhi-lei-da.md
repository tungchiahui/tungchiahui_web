### 3.3.9 Ignition Gazebo仿真之传感器

本节将介绍如何为仿真机器人添加雷达、相机等传感器。本节代码部分内容对于我们教程中涉及到的arduino、stm32\_2w以及stm32\_4w等机器人模型而言是完全通用的。

#### 1.添加传感器插件

在进行传感器模拟之前，需要先添加一个名为`ignition-gazebo-sensors-system`的插件，打开urdf文件，在`<robot>`根标签内添加如下代码：

```xml
  <gazebo>
    <plugin
      filename="ignition-gazebo-sensors-system"
      name="ignition::gazebo::systems::Sensors">
      <render_engine>ogre2</render_engine>
    </plugin>
  </gazebo>
```

ignition-gazebo-sensors-system是Ignition Gazebo仿真环境的插件，提供传感器模型和相关功能，用于创建、模拟和测试各种传感器设备。它包含常见传感器模型，如摄像头、激光雷达等。

#### 2.添加激光雷达仿真

接下来我们实现激光雷达仿真，在`<robot>`根标签内添加如下代码：

```xml
  <!-- 雷达传感器 -->
  <gazebo reference="laser">
    <sensor name='gpu_lidar' type='gpu_lidar'>
      <topic>scan</topic>
      <update_rate>30</update_rate>
      <lidar>
        <scan>
          <horizontal>
            <samples>640</samples>
            <resolution>1</resolution>
            <min_angle>-3.1415926</min_angle>
            <max_angle>3.1415926</max_angle>
          </horizontal>
          <vertical>
            <samples>16</samples>
            <resolution>1</resolution>
            <min_angle>-0.261799</min_angle>
            <max_angle>0.261799</max_angle>
          </vertical>
        </scan>
        <range>
          <min>0.08</min>
          <max>10.0</max>
          <resolution>0.01</resolution>
        </range>
      </lidar>
      <alwaysOn>1</alwaysOn>
      <visualize>true</visualize>
      <ignition_frame_id>laser</ignition_frame_id>
    </sensor>
  </gazebo>
```

#### 3.添加单目相机仿真

再实现单目相机仿真，在`<robot>`根标签内添加如下代码：

```xml
  <gazebo reference="camera" >
    <sensor name="cam_link" type="camera">
      <update_rate>10.0</update_rate>
      <always_on>true</always_on>
      <ignition_frame_id>camera</ignition_frame_id>
      <pose>0 0 0 0 0 0</pose>
      <topic>/image_raw</topic>
      <camera name="my_camera">
        <horizontal_fov>1.3962634</horizontal_fov>
        <image>
           <width>600</width>
           <height>600</height>
           <format>R8G8B8</format>
        </image>
        <clip>
          <near>0.02</near>
          <far>300</far>
        </clip>
      </camera>
    </sensor>
  </gazebo>
```

#### 4.添加深度相机仿真

最后实现深度相机仿真，在`<robot>`根标签内添加如下代码：

```xml
  <gazebo reference="camera">
    <sensor name="depth_camera" type="depth_camera">
          <update_rate>10</update_rate>
          <topic>depth_camera</topic>
          <camera>
            <horizontal_fov>1.05</horizontal_fov>
            <image>
              <width>256</width>
              <height>256</height>
              <format>R_FLOAT32</format>
            </image>
            <clip>
              <near>0.1</near>
              <far>10.0</far>
            </clip>
          </camera>
          <alwaysOn>1</alwaysOn>
          <ignition_frame_id>camera</ignition_frame_id>
      </sensor>
  </gazebo>
```

#### 5.修改launch文件

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
    world_file = os.path.join(this_pkg,"world","house.sdf")

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
            "/scan@sensor_msgs/msg/LaserScan@gz.msgs.LaserScan",
            "/scan/points@sensor_msgs/msg/PointCloud2@gz.msgs.PointCloudPacked",
            "/image_raw@sensor_msgs/msg/Image@gz.msgs.Image",
            "/camera_info@sensor_msgs/msg/CameraInfo@gz.msgs.CameraInfo",
            "/depth_camera@sensor_msgs/msg/Image@gz.msgs.Image",
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

#### 6.构建

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select mycar_description demo_gazebo_sim
```

#### 7.执行

终端中进入当前工作空间，调用如下指令执行launch文件：

```
. install/setup.bash
export MYCAR_MODEL=stm32_4w # MYCAR_MODEL值可以设置为arduino、stm32_2w 或stm32_4w
ros2 launch demo_gazebo_sim gazebo_sim_world.launch.py
```

再启动键盘控制节点，就可以控制机器人运动了。

还可以启动rviz2，以查看机器人发布的诸多数据。终端中进入当前工作空间，调用如下指令执行launch文件：

```
. install/setup.bash
rviz2
```

![](/assets/3.3.9_添加传感器.PNG)

