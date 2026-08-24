### 3.3.7 Ignition Gazebo添加机器人

Ignition Gazebo中可以直接创建机器人模型，或者也可以加载ROS2中URDF格式的机器人模型，此处我们使用后者。

#### 1.准备机器人模型功能包

复制机器人描述功能包mycar\_description到工作空间的src目录，ign\_models中新建mycar\_description目录，并将功能包mycar\_description下的mesh目录复制进ign\_models中的mycar\_description目录。

#### 2.机器人模型功能包下新建launch文件

新建launch文件mycar\_desc\_sim.launch.py，并输入如下内容：

```py
from launch import LaunchDescription
from launch_ros.actions import Node
import os
from ament_index_python.packages import get_package_share_directory
from launch_ros.parameter_descriptions import ParameterValue
from launch.substitutions import Command,LaunchConfiguration
from launch.actions import DeclareLaunchArgument

#示例： ros2 launch cpp06_urdf display.launch.py model:=`ros2 pkg prefix --share cpp06_urdf`/urdf/urdf/demo01_helloworld.urdf
def generate_launch_description():

    MYCAR_MODEL = os.environ['MYCAR_MODEL']

    mycar_description = get_package_share_directory("mycar_description")
    default_model_path = os.path.join(mycar_description,"urdf",MYCAR_MODEL + ".urdf")
    model = DeclareLaunchArgument(name="model", default_value=default_model_path)

    # 加载机器人模型
    # 启动 robot_state_publisher 节点并以参数方式加载 urdf 文件
    robot_description = ParameterValue(Command(["xacro ",LaunchConfiguration("model")]))
    robot_state_publisher = Node(
        package="robot_state_publisher",
        executable="robot_state_publisher",
        parameters=[{"robot_description": robot_description}]
    )

    return LaunchDescription([
        model,
        robot_state_publisher,
    ])
```

较之于以往该文件缺少了joint\_state\_publisher节点，该节点作用是发布活动关节状态，这一功能后续由ignition实现。

#### 3.添加机器人模型

修改gazebo\_sim\_world.launch.py文件，包含机器人模型的发布文件并在Gazebo中生成机器人模型，修改后的代码如下：

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
                "-x", "0",
                "-z", "0.01", #设置为0,可能会陷进地里
                "-y", "0",
                "-topic", "/robot_description"],
            output="screen")

    return LaunchDescription([
        gz_sim,
        spawn,
        mycar_desc,
    ])
```

#### 4.构建

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select mycar_description demo_gazebo_sim
```

#### 5.执行

终端中进入当前工作空间，调用如下指令执行launch文件：

```
. install/setup.bash
export MYCAR_MODEL=stm32_4w # MYCAR_MODEL值可以设置为arduino、stm32_2w 或stm32_4w
ros2 launch demo_gazebo_sim gazebo_sim_world.launch.py
```

运行结果如下图所示。![](/assets/3.3.7_添加机器人.PNG)

