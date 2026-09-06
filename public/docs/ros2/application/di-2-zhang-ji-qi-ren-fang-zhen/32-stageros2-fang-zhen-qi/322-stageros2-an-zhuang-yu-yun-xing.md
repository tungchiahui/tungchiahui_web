### 3.2.2 stage\_ros2仿真框架搭建

本节开始，我们将介绍如何通过stage\_ros2自定义仿真环境。

#### 1.准备工作

首先请创建一个功能包，指令如下：

```
ros2 pkg create demo_stage_sim --dependencies stage_ros2
```

然后在功能包下新建launch、world、config目录，并修改功能包下的CMakeLists.txt文件，添加如下代码：

```
install(DIRECTORY launch world config DESTINATION share/${PROJECT_NAME})
```

其中，launch目录用于存储launch文件，config用于存储rviz2的配置文件，world用于存储仿真相关文件。world目录中请新建maps目录，并将课程配套资料中的图片素材复制进去。

#### 2.搭建代码框架

在功能包的launch目录下，新建stage\_sim.launch.py文件，并输入如下内容：

```py
import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():

    this_directory = get_package_share_directory('demo_stage_sim')

    return LaunchDescription([
        Node(
            package='stage_ros2',
            executable='stage_ros2',
            name='stage',
            parameters=[{
                "world_file": os.path.join(this_directory,'world','sim.world')}],
        )
    ])
```

该launch文件将运行stage\_ros2节点，并加载world目录下的sim.world文件。

在world目录下，新建sim.world文件，并输入如下内容：

```
# -----------------------------------------------------------------------------
# 设置窗体
# 设置模拟器地图分辨率(以 米/像素 为单位)
resolution 0.02
# 设置模拟器的时间步长(以 毫秒 为单位)
interval_sim 100
```

sim.world文件当前只是声明了仿真环境的一些通用参数。

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select demo_stage_sim
```

#### 4.执行

当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 launch demo_stage_sim stage_sim.launch.py
```

执行该launch文件后，将生成一个窗口，该窗口中并无任何内容，下一步我们就可以着手创建具体的仿真内容了。

![](/assets/3.2.2_空窗.PNG)

#### 5.world文件参数

**摘要和默认值**

```
name                      <worldfile name>
interval_sim              100
quit_time                 0
resolution                0.02
show_clock                0
show_clock_interval       100
threads                   0
```

**详解**

* name &lt;string&gt;

  用于世界的识别名称，例如在图形用户界面的标题栏中使用。

* interval\_sim &lt;float&gt;

  每次调用 World::Update\(\) 时运行的模拟时间量。每个模型都有其自己可配置的更新间隔，可以大于或小于此值，但比此值更短的间隔在图形用户界面或 World 更新回调中是不可见的。您可能不需要改变默认值100毫秒：此值在客户端内部使用，如Player和WebSim。

* quit\_time &lt;float&gt;  
  在模拟时间达到指定的秒数后停止模拟。在 libstage 中，World::Update\(\) 返回 true。在带有图形用户界面的 Stage 中，模拟被暂停。在没有图形用户界面的 Stage 中，Stage 会退出。

* resolution &lt;float&gt;  
  底层位图模型的分辨率（以米为单位）。较大的值可以加快射线追踪速度，但会以碰撞检测和感知精度为代价。通常情况下，默认值是一个合理的选择。

* show\_clock &lt;int&gt;

  如果非零，每经过 $show\_clock\_interval 次更新就在标准输出上打印模拟时间。这对于观察非 GUI 模拟的进展非常有用。

* show\_clock\_interval &lt;int&gt;

  设置在启用 $show\_clock 的情况下，在标准输出上打印时间之间的更新次数。默认值是每经过 10 秒模拟时间打印一次。较小的值会稍微降低模拟速度。

* threads &lt;int&gt;

  要生成的工作线程数。一些模型可以并行更新（例如激光器、测距仪），在这里运行 2 个或更多线程可能会使模拟运行更快，取决于可用的 CPU 内核数量和世界文件的情况。如果您有启用并行的高分辨率模型（例如带有数百或数千个样本的激光器或大量模型），则每个内核使用一个线程。



